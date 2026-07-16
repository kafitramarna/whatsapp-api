/**
 * API Key Authentication Middleware
 * 
 * Validates API key from x-api-key header and attaches user to request
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { User } from '../models/User';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

/**
 * Verify API key and attach user to request
 */
export async function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = (request.headers['x-api-key'] as string) || (request.query as { api_key?: string }).api_key;

  if (!apiKey) {
    reply.status(401).send({
      success: false,
      error: 'Missing API key. Provide x-api-key header.',
    });
    return;
  }

  try {
    // Find user by API key (hashed lookup)
    const user = await User.findByApiKey(apiKey);

    if (!user) {
      reply.status(401).send({
        success: false,
        error: 'Invalid API key',
      });
      return;
    }

    // Attach user to request
    request.user = user;
  } catch (error) {
    console.error('[Auth] Error validating API key:', error);
    reply.status(500).send({
      success: false,
      error: 'Authentication error',
    });
  }
}

export default apiKeyAuth;
