/**
 * SSRF Guard
 *
 * Validates URLs to prevent Server-Side Request Forgery attacks.
 * Blocks private IP ranges, link-local addresses, and metadata endpoints.
 */

import { lookup } from 'dns/promises';
import { isIP } from 'net';

const PRIVATE_IP_RANGES = [
  // 10.0.0.0/8
  { start: 167772160, end: 184549375 },
  // 172.16.0.0/12
  { start: 2886729728, end: 2887778303 },
  // 192.168.0.0/16
  { start: 3232235520, end: 3232301055 },
  // 127.0.0.0/8 (loopback)
  { start: 2130706432, end: 2147483647 },
  // 169.254.0.0/16 (link-local / AWS metadata)
  { start: 2851995648, end: 2852061183 },
  // 0.0.0.0/8
  { start: 0, end: 16777215 },
  // 100.64.0.0/10 (CGNAT)
  { start: 1681915904, end: 1686110207 },
];

function ipToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return null;
  }
  return ((parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function isPrivateIP(ip: string): boolean {
  // Handle IPv6
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    if (lower.startsWith('fe80')) return true; // link-local
    if (lower.startsWith('::ffff:')) {
      // IPv4-mapped IPv6 — extract the IPv4 part
      const v4 = lower.split(':').pop();
      if (v4) return isPrivateIP(v4);
    }
    return false;
  }

  const int = ipToInt(ip);
  if (int === null) return true;
  return PRIVATE_IP_RANGES.some((range) => int >= range.start && int <= range.end);
}

const BLOCKED_HOSTNAMES = [
  'metadata.google.internal',
  'metadata',
  'localhost',
  'ip-ranges.amazonaws.com',
];

const MAX_RESPONSE_SIZE = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

export interface SafeFetchOptions {
  maxResponseSize?: number;
  timeoutMs?: number;
}

/**
 * Validate that a URL is safe to fetch from (not pointing to private/internal resources).
 * Throws Error if the URL is unsafe.
 */
export async function validateUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw new Error(`Blocked hostname: ${hostname}`);
  }

  const directIP = isIP(hostname);
  if (directIP) {
    if (isPrivateIP(hostname)) {
      throw new Error(`Access to private IP is blocked: ${hostname}`);
    }
    return;
  }

  try {
    const result = await lookup(hostname, { all: true });
    for (const record of result) {
      if (isPrivateIP(record.address)) {
        throw new Error(`Hostname ${hostname} resolves to private IP: ${record.address}`);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('resolves to private IP')) {
      throw err;
    }
    throw new Error(`DNS resolution failed for ${hostname}: ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}

/**
 * Safely fetch a URL with SSRF protection, timeout, and size limit.
 */
export async function safeFetch(url: string, options?: SafeFetchOptions): Promise<Response> {
  await validateUrl(url);

  const maxResponseSize = options?.maxResponseSize ?? MAX_RESPONSE_SIZE;
  const timeoutMs = options?.timeoutMs ?? FETCH_TIMEOUT_MS;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > maxResponseSize) {
      throw new Error(`Response too large: ${contentLength} bytes (max ${maxResponseSize})`);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export { isPrivateIP, MAX_RESPONSE_SIZE, FETCH_TIMEOUT_MS };
