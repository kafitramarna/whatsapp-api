/**
 * WhatsApp API Gateway
 * 
 * Main application entry point
 */

import 'reflect-metadata';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import apiReference from '@scalar/fastify-api-reference';
import { env, validateEnv } from './config/env';
import { initDatabase, closeDatabase } from './config/database';
import { swaggerConfig } from './config/swagger';
import { sessionRoutes } from './routes/sessionRoutes';
import { userRoutes } from './routes/userRoutes';
import { authRoutes } from './routes/authRoutes';
import { logRoutes } from './routes/logRoutes';
import { restoreAllSessions, closeAllSessions } from './services/whatsappService';
import { startScheduler, stopScheduler } from './services/schedulerService';
import { User } from './models/User';
import { apiLogger } from './plugins/apiLogger';

// Create Fastify instance
const app: FastifyInstance = Fastify({
  logger: {
    level: env.logLevel,
    transport: env.isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        }
      : undefined,
  },
  bodyLimit: 10 * 1024 * 1024, // 10MB max request body
  ajv: {
    customOptions: {
      removeAdditional: true,
      coerceTypes: true,
      useDefaults: true,
      keywords: ['example'],
    },
  },
});

/**
 * Register plugins and routes
 */
async function registerPlugins(): Promise<void> {
  // Swagger documentation (OpenAPI 3.0 generator)
  await app.register(swagger, swaggerConfig);

  // Scalar API Reference (Better UI + Code Snippets)
  await app.register(apiReference, {
    routePrefix: '/docs',
    configuration: {
      title: 'VenusConnect API Documentation',
      theme: 'purple',
      spec: {
        content: () => app.swagger(),
      },
    },
  });

  // Rate limiting - per-user anti-spam protection
  await app.register(rateLimit, {
    max: 100, // 100 requests per window
    timeWindow: '1 minute',
    keyGenerator: (req) => req.user?.id || req.ip,
    errorResponseBuilder: () => ({
      success: false,
      error: 'Too many requests. Please slow down.',
      code: 'RATE_LIMIT_EXCEEDED',
    }),
  });

  // CORS — restricted via env, blocked in production by default
  await app.register(cors, {
    origin: env.corsOrigins.length > 0 ? env.corsOrigins : !env.isProd,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key'],
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  // API request logging to database
  await app.register(apiLogger);

  // Health check route (no auth required)
  app.get('/health', {
    schema: {
      hide: true,
    },
  }, async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // API info route
  app.get('/', {
    schema: {
      hide: true,
      tags: ['Health'],
      summary: 'API Info',
      description: 'Returns API information and documentation links',
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            documentation: { type: 'string' },
            openapi: { type: 'string' },
          },
        },
      },
    },
  }, async () => {
    return {
      name: 'VenusConnect - WhatsApp API Gateway',
      version: '1.0.0',
      documentation: '/docs',
      openapi: '/openapi.json',
    };
  });

  // Serve OpenAPI 3.0 specification
  app.get('/openapi.json', {
    schema: {
      tags: ['Health'],
      summary: 'OpenAPI 3.0 Specification',
      description: 'Returns the complete OpenAPI 3.0.3 specification in JSON format',
      hide: true,
    },
  }, async (_, reply) => {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const specPath = path.join(__dirname, '..', 'docs', 'openapi.json');
      const spec = await fs.readFile(specPath, 'utf-8');
      reply.header('Content-Type', 'application/json');
      return spec;
    } catch {
      return { error: 'OpenAPI specification not found' };
    }
  });

  // Register session routes under /api prefix
  await app.register(sessionRoutes, { prefix: '/api' });

  // Register user routes under /api prefix
  await app.register(userRoutes, { prefix: '/api' });

  // Register auth routes under /api prefix (PUBLIC - no auth required)
  await app.register(authRoutes, { prefix: '/api' });

  // Register log routes under /api prefix (admin only)
  await app.register(logRoutes, { prefix: '/api' });
}

/**
 * Create initial admin user if not exists
 */
async function seedDatabase(): Promise<void> {
  try {
    const userCount = await User.count();

    if (userCount === 0 && !env.publicRegistration) {
      const adminUser = await User.create({
        username: 'admin',
        password: 'admin123', // Will be hashed by model hook
        role: 'admin', // Set as admin
      });

      console.log('='.repeat(60));
      console.log('🔐 INITIAL ADMIN USER CREATED');
      console.log('='.repeat(60));
      console.log(`Username: admin`);
      console.log(`Password: admin123`);
      console.log(`Role:     admin`);
      console.log(`API Key:  ${adminUser.api_key}`);
      console.log('='.repeat(60));
      console.log('⚠️  Please change the password after first login!');
      console.log('⚠️  Save your API Key now — it will NOT be shown again!');
      console.log('='.repeat(60));
    } else if (userCount === 0 && env.publicRegistration) {
      console.log('[Seed] Public registration is enabled — no default admin created.');
      console.log('[Seed] First user should register via POST /api/auth/register');
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

/**
 * Start the server
 */
async function start(): Promise<void> {
  try {
    // Validate environment
    validateEnv();

    // Initialize database
    await initDatabase();

    // Seed database with initial data
    await seedDatabase();

    // Register plugins and routes
    await registerPlugins();

    // Restore existing sessions
    await restoreAllSessions();

    // Start scheduled message processor
    startScheduler();

    // Start server
    const address = await app.listen({
      port: env.port,
      host: env.host,
    });

    console.log('');
    console.log('🚀 WhatsApp API Gateway is running!');
    console.log(`📍 Server: ${address}`);
    console.log(`🔧 Environment: ${env.nodeEnv}`);
    console.log(`⏰ Scheduler: Active (checking every minute)`);
    console.log(`🛡️  Rate Limit: 100 requests/minute`);
    console.log('');
    console.log('API Endpoints:');
    console.log('');
    console.log('Session:');
    console.log(`  POST   ${address}/api/session/create`);
    console.log(`  GET    ${address}/api/sessions`);
    console.log(`  GET    ${address}/api/session/:id/status`);
    console.log(`  GET    ${address}/api/session/:id/qr`);
    console.log(`  DELETE ${address}/api/session/:id`);
    console.log(`  POST   ${address}/api/session/:id/send`);
    console.log(`  POST   ${address}/api/session/:id/broadcast`);
    console.log(`  POST   ${address}/api/session/:id/schedule`);
    console.log('');
    console.log('User:');
    console.log(`  GET    ${address}/api/users/me`);
    console.log(`  POST   ${address}/api/users`);
    console.log(`  GET    ${address}/api/users`);
    console.log(`  GET    ${address}/api/users/:id`);
    console.log(`  PUT    ${address}/api/users/:id`);
    console.log(`  DELETE ${address}/api/users/:id`);
    console.log(`  POST   ${address}/api/users/:id/regenerate-key`);
    console.log('');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  console.log('\n🛑 Shutting down gracefully...');

  try {
    // Stop scheduler
    stopScheduler();

    // Close all WhatsApp sessions
    await closeAllSessions();

    // Close server
    await app.close();

    // Close database
    await closeDatabase();

    console.log('👋 Goodbye!');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the application
start();

export default app;
