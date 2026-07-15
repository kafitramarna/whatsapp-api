import Fastify, { FastifyInstance } from 'fastify';
import request from 'supertest';
import { sequelize } from '../src/config/database';
import { User } from '../src/models/User';
import { apiKeyAuth } from '../src/middleware/apiKeyAuth';
import { adminOnly } from '../src/middleware/adminOnly';
import { apiLogger } from '../src/plugins/apiLogger';

let app: FastifyInstance;
let testUser: User;
let testApiKey: string;

beforeAll(async () => {
  await sequelize.authenticate();
  await sequelize.sync();

  // Create test user
  testUser = await User.create({
    username: 'jest_test_' + Date.now(),
    password: 'testpass123',
    role: 'admin',
  });
  testApiKey = testUser.api_key;

  // Build minimal Fastify app for testing
  app = Fastify({ logger: false });
  await app.register(apiLogger);

  // Health route (should NOT be logged)
  app.get('/health', async () => ({ status: 'ok' }));

  // Protected route
  app.get('/api/protected', {
    preHandler: apiKeyAuth,
  }, async (req, reply) => {
    reply.send({ success: true, user: req.user?.username });
  });

  // Admin-only route
  app.get('/api/admin', {
    preHandler: [apiKeyAuth, adminOnly],
  }, async () => ({ success: true, admin: true }));

  // Error route
  app.get('/api/error', {
    preHandler: apiKeyAuth,
  }, async () => {
    throw new Error('Intentional test error');
  });

  await app.ready();
});

afterAll(async () => {
  if (testUser) {
    await testUser.destroy();
  }
  await app.close();
  await sequelize.close();
});

describe('API Authentication', () => {
  it('should reject request without API key', async () => {
    const res = await request(app.server).get('/api/protected');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Missing API key');
  });

  it('should reject request with invalid API key', async () => {
    const res = await request(app.server)
      .get('/api/protected')
      .set('x-api-key', 'invalid_key_123');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Invalid API key');
  });

  it('should accept request with valid API key', async () => {
    const res = await request(app.server)
      .get('/api/protected')
      .set('x-api-key', testApiKey);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toBe(testUser.username);
  });
});

describe('Admin Access Control', () => {
  it('should allow admin user to access admin endpoint', async () => {
    const res = await request(app.server)
      .get('/api/admin')
      .set('x-api-key', testApiKey);
    expect(res.status).toBe(200);
    expect(res.body.admin).toBe(true);
  });
});

describe('API Logging', () => {
  it('should log successful requests to database', async () => {
    // Make a request
    await request(app.server)
      .get('/api/protected')
      .set('x-api-key', testApiKey);

    // Wait for onResponse hook to write to DB
    await new Promise((r) => setTimeout(r, 500));

    const { ApiLog } = await import('../src/models/ApiLog');
    const logs = await ApiLog.findAll({
      where: { endpoint: '/api/protected', method: 'GET' },
      order: [['created_at', 'DESC']],
      limit: 1,
    });

    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].status_code).toBe(200);
    expect(logs[0].is_error).toBe(false);
    expect(logs[0].user_id).toBe(testUser.id);
  });

  it('should log error requests with error details', async () => {
    await request(app.server)
      .get('/api/error')
      .set('x-api-key', testApiKey);

    await new Promise((r) => setTimeout(r, 500));

    const { ApiLog } = await import('../src/models/ApiLog');
    const logs = await ApiLog.findAll({
      where: { endpoint: '/api/error', method: 'GET' },
      order: [['created_at', 'DESC']],
      limit: 1,
    });

    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].is_error).toBe(true);
    expect(logs[0].error_message).toContain('Intentional test error');
  });

  it('should log unauthorized requests (no API key)', async () => {
    await request(app.server).get('/api/protected');

    await new Promise((r) => setTimeout(r, 500));

    const { ApiLog } = await import('../src/models/ApiLog');
    const logs = await ApiLog.findAll({
      where: { endpoint: '/api/protected', method: 'GET', is_error: true },
      order: [['created_at', 'DESC']],
      limit: 5,
    });

    const has401 = logs.some((l) => l.status_code === 401);
    expect(has401).toBe(true);
  });

  it('should NOT log health check endpoint', async () => {
    await request(app.server).get('/health');

    await new Promise((r) => setTimeout(r, 500));

    const { ApiLog } = await import('../src/models/ApiLog');
    const logs = await ApiLog.findAll({
      where: { endpoint: '/health' },
    });

    expect(logs.length).toBe(0);
  });

  it('should capture user agent and IP address', async () => {
    await request(app.server)
      .get('/api/protected')
      .set('x-api-key', testApiKey)
      .set('User-Agent', 'JestTestAgent/1.0');

    await new Promise((r) => setTimeout(r, 500));

    const { ApiLog } = await import('../src/models/ApiLog');
    const log = await ApiLog.findOne({
      where: { endpoint: '/api/protected', method: 'GET' },
      order: [['created_at', 'DESC']],
    });

    expect(log).toBeTruthy();
    expect(log?.user_agent).toContain('JestTestAgent');
    expect(log?.ip_address).toBeTruthy();
    expect(log?.response_time_ms).toBeGreaterThanOrEqual(0);
  });
});
