/**
 * Webhook Service
 *
 * Centralized webhook delivery with HMAC signing, retry with backoff,
 * fan-out to multiple endpoints, and event filtering.
 */

import crypto from 'crypto';
import { Op } from 'sequelize';
import { WebhookEndpoint } from '../models/WebhookEndpoint';
import { WebhookLog, WebhookLogStatus } from '../models/WebhookLog';
import { sessionStore } from './sessionStore';
import { validateUrl } from '../lib/ssrfGuard';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 30000, 120000]; // 5s, 30s, 120s

function getJitter(maxMs: number): number {
  return Math.floor(Math.random() * maxMs);
}

function getNextRetryDelay(attempt: number): number {
  const baseDelay = RETRY_DELAYS[attempt - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
  const jitterMax = attempt === 1 ? 2000 : attempt === 2 ? 10000 : 30000;
  return baseDelay + getJitter(jitterMax);
}

function signPayload(body: string, secret: string): { signature: string; timestamp: string } {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return { signature, timestamp };
}

async function sendToEndpoint(
  url: string,
  payload: string,
  secret?: string
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    await validateUrl(url);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (secret) {
      const { signature, timestamp } = signPayload(payload, secret);
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
      headers['X-Webhook-Timestamp'] = timestamp;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      return { success: true, status: response.status };
    }
    return { success: false, status: response.status, error: `HTTP ${response.status}` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Deliver a webhook event to all matching endpoints for a session.
 * Also delivers to the legacy single webhook URL if configured and event matches.
 */
export async function deliverWebhook(
  sessionId: string,
  event: string,
  data: unknown
): Promise<void> {
  const payload = JSON.stringify({
    event,
    sessionId,
    timestamp: new Date().toISOString(),
    data,
  });

  // Collect all active endpoints for this session
  const endpoints = await WebhookEndpoint.findAll({
    where: { session_id: sessionId, is_active: true },
  });

  // Also check legacy single webhook URL from sessionStore
  const runtime = sessionStore.get(sessionId);
  const legacyUrl = runtime?.webhookUrl;
  const legacySecret = runtime?.webhookSecret;
  const legacyEvents: string[] = runtime?.webhookEvents || [];

  // Check if legacy URL should receive this event
  const legacyMatches = legacyUrl && (legacyEvents.length === 0 || legacyEvents.includes(event));

  // Build list of targets: legacy URL + endpoint records
  const targets: Array<{ url: string; secret?: string }> = [];

  if (legacyMatches) {
    targets.push({ url: legacyUrl!, secret: legacySecret });
  }

  for (const ep of endpoints) {
    if (ep.shouldReceiveEvent(event)) {
      targets.push({ url: ep.url, secret: ep.secret || undefined });
    }
  }

  if (targets.length === 0) return;

  // Fan-out: deliver to all targets
  await Promise.allSettled(
    targets.map(async (target) => {
      const log = await WebhookLog.create({
        session_id: sessionId,
        endpoint_url: target.url,
        event,
        payload,
        status: WebhookLogStatus.PENDING,
        attempts: 0,
      });

      await attemptDelivery(log, target.url, target.secret, payload);
    })
  );
}

/**
 * Attempt a single delivery, update log, schedule retry on failure.
 */
async function attemptDelivery(
  log: WebhookLog,
  url: string,
  secret: string | undefined,
  payload: string
): Promise<void> {
  log.attempts += 1;
  log.last_attempt_at = new Date();

  const result = await sendToEndpoint(url, payload, secret);

  if (result.success) {
    log.status = WebhookLogStatus.SUCCESS;
    log.response_status = result.status ?? null;
    log.error_message = null;
    await log.save();
    return;
  }

  log.response_status = result.status ?? null;
  log.error_message = result.error ?? null;

  if (log.attempts >= MAX_RETRIES + 1) {
    log.status = WebhookLogStatus.FAILED;
    log.next_retry_at = null;
  } else {
    log.status = WebhookLogStatus.RETRYING;
    const delay = getNextRetryDelay(log.attempts);
    log.next_retry_at = new Date(Date.now() + delay);
  }

  await log.save();
}

/**
 * Process the retry queue — find all logs scheduled for retry and attempt redelivery.
 */
export async function processRetryQueue(): Promise<void> {
  const pendingRetries = await WebhookLog.findAll({
    where: {
      status: WebhookLogStatus.RETRYING,
      next_retry_at: { [Op.lte]: new Date() },
    },
    limit: 50,
  });

  for (const log of pendingRetries) {
    // Find the endpoint secret for this URL
    let secret: string | undefined;

    // Check WebhookEndpoint records
    const ep = await WebhookEndpoint.findOne({
      where: { session_id: log.session_id, url: log.endpoint_url },
    });
    if (ep) {
      secret = ep.secret || undefined;
    } else {
      // Check legacy sessionStore
      const runtime = sessionStore.get(log.session_id);
      if (runtime?.webhookUrl === log.endpoint_url) {
        secret = runtime.webhookSecret;
      }
    }

    await attemptDelivery(log, log.endpoint_url, secret, log.payload);
  }
}

let retryInterval: NodeJS.Timeout | null = null;

/**
 * Start the retry processor — checks every 10 seconds for pending retries.
 */
export function startRetryProcessor(): void {
  if (retryInterval) return;
  retryInterval = setInterval(async () => {
    try {
      await processRetryQueue();
    } catch (error) {
      console.error('[Webhook] Retry processor error:', error);
    }
  }, 10000);
  console.log('[Webhook] Retry processor started (checking every 10s)');
}

/**
 * Stop the retry processor.
 */
export function stopRetryProcessor(): void {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
    console.log('[Webhook] Retry processor stopped');
  }
}

/**
 * Manually retry a failed webhook log entry.
 */
export async function manualRetry(logId: number): Promise<WebhookLog | null> {
  const log = await WebhookLog.findByPk(logId);
  if (!log) return null;
  if (log.status === WebhookLogStatus.SUCCESS) return log;

  let secret: string | undefined;
  const ep = await WebhookEndpoint.findOne({
    where: { session_id: log.session_id, url: log.endpoint_url },
  });
  if (ep) {
    secret = ep.secret || undefined;
  } else {
    const runtime = sessionStore.get(log.session_id);
    if (runtime?.webhookUrl === log.endpoint_url) {
      secret = runtime.webhookSecret;
    }
  }

  log.status = WebhookLogStatus.PENDING;
  await log.save();
  await attemptDelivery(log, log.endpoint_url, secret, log.payload);
  return log;
}

/**
 * Send a test webhook to a specified URL and return the result.
 */
export async function testWebhook(
  sessionId: string,
  url: string,
  secret?: string
): Promise<{ success: boolean; status?: number; latencyMs: number; error?: string }> {
  const payload = JSON.stringify({
    event: 'webhook.test',
    sessionId,
    timestamp: new Date().toISOString(),
    data: { message: 'Test webhook from VenusConnect', test: true },
  });

  const start = Date.now();
  const result = await sendToEndpoint(url, payload, secret);
  const latencyMs = Date.now() - start;

  return { ...result, latencyMs };
}

export default {
  deliverWebhook,
  processRetryQueue,
  startRetryProcessor,
  stopRetryProcessor,
  manualRetry,
  testWebhook,
};
