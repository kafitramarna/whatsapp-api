/**
 * Webhook Controller
 *
 * CRUD for webhook endpoints, test endpoint, delivery logs, manual retry, events config.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { WebhookEndpoint } from '../models/WebhookEndpoint';
import { WebhookLog } from '../models/WebhookLog';
import { Session } from '../models/Session';
import { sessionStore } from '../services/sessionStore';
import { testWebhook, manualRetry } from '../services/webhookService';

interface SessionParams {
  sessionId: string;
}

interface EndpointParams {
  sessionId: string;
  endpointId: string;
}

interface CreateEndpointBody {
  url: string;
  secret?: string;
  events?: string[];
}

interface UpdateEndpointBody {
  url?: string;
  secret?: string;
  events?: string[];
  is_active?: boolean;
}

interface TestWebhookBody {
  url: string;
  secret?: string;
}

interface UpdateEventsBody {
  events: string[];
}

interface LogParams {
  sessionId: string;
  logId: string;
}

interface ListLogsQuery {
  page?: number;
  limit?: number;
  status?: string;
}

async function verifySessionOwnership(sessionId: string, userId: string) {
  const session = await Session.findOne({
    where: { session_id: sessionId, user_id: userId },
  });
  if (!session) return null;
  return session;
}

/**
 * List all webhook endpoints for a session
 * GET /session/:sessionId/webhooks
 */
export async function listWebhookEndpointsHandler(
  request: FastifyRequest<{ Params: SessionParams }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const user = request.user!;

    const session = await verifySessionOwnership(sessionId, user.id);
    if (!session) {
      reply.status(404).send({ success: false, error: 'Session not found' });
      return;
    }

    const endpoints = await WebhookEndpoint.findAll({
      where: { session_id: sessionId },
      order: [['created_at', 'DESC']],
    });

    reply.send({
      success: true,
      data: endpoints.map((ep) => ({
        id: ep.id,
        url: ep.url,
        secret: ep.secret ? '****' : null,
        events: ep.getEventList(),
        is_active: ep.is_active,
        created_at: ep.createdAt,
      })),
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Create a new webhook endpoint
 * POST /session/:sessionId/webhooks
 */
export async function createWebhookEndpointHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: CreateEndpointBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { url, secret, events } = request.body;
    const user = request.user!;

    const session = await verifySessionOwnership(sessionId, user.id);
    if (!session) {
      reply.status(404).send({ success: false, error: 'Session not found' });
      return;
    }

    if (!url) {
      reply.status(400).send({ success: false, error: 'Missing url' });
      return;
    }

    const endpoint = await WebhookEndpoint.create({
      session_id: sessionId,
      url,
      secret: secret || null,
      events: events ? JSON.stringify(events) : null,
      is_active: true,
    });

    reply.send({
      success: true,
      data: {
        id: endpoint.id,
        url: endpoint.url,
        secret: endpoint.secret ? '****' : null,
        events: endpoint.getEventList(),
        is_active: endpoint.is_active,
      },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Update a webhook endpoint
 * PUT /session/:sessionId/webhooks/:endpointId
 */
export async function updateWebhookEndpointHandler(
  request: FastifyRequest<{ Params: EndpointParams; Body: UpdateEndpointBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, endpointId } = request.params;
    const { url, secret, events, is_active } = request.body;
    const user = request.user!;

    const session = await verifySessionOwnership(sessionId, user.id);
    if (!session) {
      reply.status(404).send({ success: false, error: 'Session not found' });
      return;
    }

    const endpoint = await WebhookEndpoint.findOne({
      where: { id: parseInt(endpointId, 10), session_id: sessionId },
    });

    if (!endpoint) {
      reply.status(404).send({ success: false, error: 'Webhook endpoint not found' });
      return;
    }

    if (url !== undefined) endpoint.url = url;
    if (secret !== undefined) endpoint.secret = secret || null;
    if (events !== undefined) endpoint.events = events.length > 0 ? JSON.stringify(events) : null;
    if (is_active !== undefined) endpoint.is_active = is_active;
    await endpoint.save();

    reply.send({
      success: true,
      data: {
        id: endpoint.id,
        url: endpoint.url,
        secret: endpoint.secret ? '****' : null,
        events: endpoint.getEventList(),
        is_active: endpoint.is_active,
      },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Delete a webhook endpoint
 * DELETE /session/:sessionId/webhooks/:endpointId
 */
export async function deleteWebhookEndpointHandler(
  request: FastifyRequest<{ Params: EndpointParams }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, endpointId } = request.params;
    const user = request.user!;

    const session = await verifySessionOwnership(sessionId, user.id);
    if (!session) {
      reply.status(404).send({ success: false, error: 'Session not found' });
      return;
    }

    const deleted = await WebhookEndpoint.destroy({
      where: { id: parseInt(endpointId, 10), session_id: sessionId },
    });

    if (!deleted) {
      reply.status(404).send({ success: false, error: 'Webhook endpoint not found' });
      return;
    }

    reply.send({ success: true, data: { deleted: true } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Test a webhook endpoint
 * POST /session/:sessionId/webhooks/test
 */
export async function testWebhookHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: TestWebhookBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { url, secret } = request.body;
    const user = request.user!;

    const session = await verifySessionOwnership(sessionId, user.id);
    if (!session) {
      reply.status(404).send({ success: false, error: 'Session not found' });
      return;
    }

    if (!url) {
      reply.status(400).send({ success: false, error: 'Missing url' });
      return;
    }

    const result = await testWebhook(sessionId, url, secret);

    reply.send({
      success: result.success,
      data: {
        url,
        status: result.status,
        latencyMs: result.latencyMs,
        error: result.error,
      },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * List webhook delivery logs
 * GET /session/:sessionId/webhooks/logs
 */
export async function listWebhookLogsHandler(
  request: FastifyRequest<{ Params: SessionParams; Querystring: ListLogsQuery }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { page = 1, limit = 20, status } = request.query;
    const user = request.user!;

    const session = await verifySessionOwnership(sessionId, user.id);
    if (!session) {
      reply.status(404).send({ success: false, error: 'Session not found' });
      return;
    }

    const where: Record<string, unknown> = { session_id: sessionId };
    if (status) where.status = status;

    const offset = (page - 1) * limit;
    const { rows, count } = await WebhookLog.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    reply.send({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Manually retry a failed webhook delivery
 * POST /session/:sessionId/webhooks/logs/:logId/retry
 */
export async function retryWebhookLogHandler(
  request: FastifyRequest<{ Params: LogParams }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, logId } = request.params;
    const user = request.user!;

    const session = await verifySessionOwnership(sessionId, user.id);
    if (!session) {
      reply.status(404).send({ success: false, error: 'Session not found' });
      return;
    }

    const log = await manualRetry(parseInt(logId, 10));
    if (!log) {
      reply.status(404).send({ success: false, error: 'Webhook log not found' });
      return;
    }

    reply.send({
      success: true,
      data: {
        id: log.id,
        status: log.status,
        attempts: log.attempts,
        response_status: log.response_status,
        error_message: log.error_message,
      },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Update session-level webhook event filter
 * PUT /session/:sessionId/webhook/events
 */
export async function updateWebhookEventsHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: UpdateEventsBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { events } = request.body;
    const user = request.user!;

    const session = await verifySessionOwnership(sessionId, user.id);
    if (!session) {
      reply.status(404).send({ success: false, error: 'Session not found' });
      return;
    }

    session.webhook_events = JSON.stringify(events);
    await session.save();

    const runtime = sessionStore.get(sessionId);
    if (runtime) {
      runtime.webhookEvents = events;
    }

    reply.send({
      success: true,
      data: {
        session_id: sessionId,
        webhook_events: events,
      },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export default {
  listWebhookEndpointsHandler,
  createWebhookEndpointHandler,
  updateWebhookEndpointHandler,
  deleteWebhookEndpointHandler,
  testWebhookHandler,
  listWebhookLogsHandler,
  retryWebhookLogHandler,
  updateWebhookEventsHandler,
};
