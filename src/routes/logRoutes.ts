/**
 * Log Routes
 *
 * API endpoints for querying API request logs (admin only)
 */

import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { Op } from 'sequelize';
import { apiKeyAuth } from '../middleware/apiKeyAuth';
import { adminOnly } from '../middleware/adminOnly';
import { ApiLog } from '../models/ApiLog';

interface LogQuery {
  page?: string;
  limit?: string;
  errorsOnly?: string;
  endpoint?: string;
  method?: string;
}

/**
 * List API logs with pagination & filtering
 * GET /logs?page=1&limit=50&errorsOnly=true&endpoint=...
 */
async function listApiLogsHandler(
  request: FastifyRequest<{ Querystring: LogQuery }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const page = parseInt(request.query.page || '1', 10);
    const limit = Math.min(parseInt(request.query.limit || '50', 10), 200);
    const errorsOnly = request.query.errorsOnly === 'true';
    const endpointFilter = request.query.endpoint;
    const methodFilter = request.query.method;

    const where: Record<string, unknown> = {};
    if (errorsOnly) where.is_error = true;
    if (endpointFilter) where.endpoint = { [Op.like]: `%${endpointFilter}%` };
    if (methodFilter) where.method = methodFilter.toUpperCase();

    const { rows, count } = await ApiLog.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    reply.send({
      success: true,
      data: {
        logs: rows,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    console.error('[Logs] List error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get specific API log by UUID
 * GET /logs/:logId
 */
async function getApiLogByIdHandler(
  request: FastifyRequest<{ Params: { logId: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const log = await ApiLog.findByPk(request.params.logId);
    if (!log) {
      reply.status(404).send({ success: false, error: 'Log not found' });
      return;
    }
    reply.send({ success: true, data: log });
  } catch (error) {
    console.error('[Logs] Get by ID error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

const LogSchemas = {
  list: {
    tags: ['Logs'],
    summary: 'List API request logs',
    description: 'Retrieve paginated API request logs with optional filtering. Admin access required.',
    security: [{ ApiKeyAuth: [] }],
    querystring: {
      type: 'object' as const,
      properties: {
        page: { type: 'integer' as const, minimum: 1, default: 1, description: 'Page number' },
        limit: { type: 'integer' as const, minimum: 1, maximum: 200, default: 50, description: 'Items per page (max 200)' },
        errorsOnly: { type: 'boolean' as const, default: false, description: 'Only return error logs (status >= 400)' },
        endpoint: { type: 'string' as const, description: 'Filter by endpoint (partial match)', example: '/api/users' },
        method: { type: 'string' as const, description: 'Filter by HTTP method', example: 'GET' },
      },
    },
    response: {
      200: {
        type: 'object' as const,
        properties: {
          success: { type: 'boolean' as const },
          data: {
            type: 'object' as const,
            properties: {
              logs: {
                type: 'array' as const,
                items: {
                  type: 'object' as const,
                  properties: {
                    id: { type: 'string' as const, format: 'uuid', description: 'Unique request ID' },
                    method: { type: 'string' as const, example: 'GET' },
                    endpoint: { type: 'string' as const, example: '/api/users/me' },
                    status_code: { type: 'integer' as const, example: 200 },
                    user_id: { type: 'string' as const, nullable: true },
                    username: { type: 'string' as const, nullable: true },
                    user_agent: { type: 'string' as const, nullable: true, example: 'Mozilla/5.0...' },
                    ip_address: { type: 'string' as const, nullable: true, example: '127.0.0.1' },
                    request_body: { type: 'string' as const, nullable: true },
                    error_message: { type: 'string' as const, nullable: true },
                    stack_trace: { type: 'string' as const, nullable: true },
                    response_time_ms: { type: 'number' as const, example: 12.5 },
                    is_error: { type: 'boolean' as const, example: false },
                    created_at: { type: 'string' as const, format: 'date-time' },
                  },
                },
              },
              pagination: {
                type: 'object' as const,
                properties: {
                  page: { type: 'integer' as const, example: 1 },
                  limit: { type: 'integer' as const, example: 50 },
                  total: { type: 'integer' as const, example: 150 },
                  totalPages: { type: 'integer' as const, example: 3 },
                },
              },
            },
          },
        },
      },
      401: {
        type: 'object' as const,
        properties: {
          success: { type: 'boolean' as const, example: false },
          error: { type: 'string' as const, example: 'Missing API key. Provide x-api-key header.' },
        },
      },
      403: {
        type: 'object' as const,
        properties: {
          success: { type: 'boolean' as const, example: false },
          error: { type: 'string' as const, example: 'Admin access required' },
        },
      },
    },
  },
  getById: {
    tags: ['Logs'],
    summary: 'Get API log by UUID',
    description: 'Retrieve a specific API log entry by its unique request UUID. Admin access required.',
    security: [{ ApiKeyAuth: [] }],
    params: {
      type: 'object' as const,
      required: ['logId'],
      properties: {
        logId: { type: 'string' as const, format: 'uuid', description: 'Unique log/request UUID', example: '550e8400-e29b-41d4-a716-446655440000' },
      },
    },
    response: {
      200: {
        type: 'object' as const,
        properties: {
          success: { type: 'boolean' as const },
          data: {
            type: 'object' as const,
            properties: {
              id: { type: 'string' as const, format: 'uuid' },
              method: { type: 'string' as const },
              endpoint: { type: 'string' as const },
              status_code: { type: 'integer' as const },
              user_id: { type: 'string' as const, nullable: true },
              username: { type: 'string' as const, nullable: true },
              user_agent: { type: 'string' as const, nullable: true },
              ip_address: { type: 'string' as const, nullable: true },
              request_body: { type: 'string' as const, nullable: true },
              error_message: { type: 'string' as const, nullable: true },
              stack_trace: { type: 'string' as const, nullable: true },
              response_time_ms: { type: 'number' as const },
              is_error: { type: 'boolean' as const },
              created_at: { type: 'string' as const, format: 'date-time' },
              updated_at: { type: 'string' as const, format: 'date-time' },
            },
          },
        },
      },
      404: {
        type: 'object' as const,
        properties: {
          success: { type: 'boolean' as const, example: false },
          error: { type: 'string' as const, example: 'Log not found' },
        },
      },
    },
  },
};

export async function logRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {
  fastify.addHook('preHandler', apiKeyAuth);

  fastify.route({
    method: 'GET',
    url: '/logs',
    schema: LogSchemas.list,
    preHandler: adminOnly,
    handler: listApiLogsHandler,
  });

  fastify.route({
    method: 'GET',
    url: '/logs/:logId',
    schema: LogSchemas.getById,
    preHandler: adminOnly,
    handler: getApiLogByIdHandler,
  });
}

export default logRoutes;
