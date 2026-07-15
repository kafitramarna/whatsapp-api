/**
 * API Request Logging Plugin
 *
 * Logs every API request to the database with:
 * - Unique UUID per request
 * - User agent / browser info
 * - IP address
 * - Request method, endpoint, status code
 * - Error details (message + stack trace) if any
 * - Response time
 * - Authenticated user info
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fp from 'fastify-plugin';
import { v4 as uuidv4 } from 'uuid';
import { ApiLog } from '../models/ApiLog';

async function apiLoggerPlugin(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {
  // Generate a unique request ID at the start of every request
  fastify.addHook('onRequest', async (request, _reply) => {
    (request as unknown as Record<string, unknown>).requestId = uuidv4();
    (request as unknown as Record<string, unknown>).requestStartTime = Date.now();
  });

  // Log to database after response is sent (or on error)
  fastify.addHook('onResponse', async (request, reply) => {
    try {
      const requestId = (request as unknown as Record<string, unknown>).requestId as string;
      const startTime = (request as unknown as Record<string, unknown>).requestStartTime as number;
      const responseTime = startTime ? Date.now() - startTime : null;
      const statusCode = reply.statusCode;
      const isError = statusCode >= 400;

      // Skip health check and docs endpoints to reduce noise
      const url = request.url || '';
      if (url === '/health' || url === '/' || url.startsWith('/docs') || url.startsWith('/openapi')) {
        return;
      }

      // Get user info if authenticated
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (request as any).user;
      const userId = user?.id || null;
      const username = user?.username || null;

      // Get client info
      const userAgent = request.headers['user-agent'] || null;
      const ipAddress = request.ip || null;

      // Truncate request body to prevent oversized logs
      let requestBody: string | null = null;
      if (request.body && typeof request.body === 'object') {
        try {
          const bodyStr = JSON.stringify(request.body);
          requestBody = bodyStr.length > 2000 ? bodyStr.substring(0, 2000) + '...[truncated]' : bodyStr;
        } catch {
          requestBody = '[unserializable]';
        }
      }

      // Get error info from reply if available
      let errorMessage: string | null = null;
      let stackTrace: string | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = (reply as any).__error;
      if (err && isError) {
        errorMessage = err.message || null;
        stackTrace = err.stack || null;
      }

      await ApiLog.create({
        id: requestId,
        method: request.method,
        endpoint: url.substring(0, 500),
        status_code: statusCode,
        user_id: userId,
        username,
        user_agent: userAgent,
        ip_address: ipAddress,
        request_body: requestBody,
        error_message: errorMessage,
        stack_trace: stackTrace,
        response_time_ms: responseTime,
        is_error: isError,
      });
    } catch (logError) {
      // Don't let logging errors break the response
      console.error('[ApiLog] Failed to log request:', logError);
    }
  });

  // Capture errors before they're handled to store error details
  fastify.addHook('onError', async (_request, reply, error) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (reply as any).__error = {
      message: error.message,
      stack: error.stack,
    };
  });
}

export const apiLogger = fp(apiLoggerPlugin, {
  name: 'apiLogger',
});

export default apiLogger;
