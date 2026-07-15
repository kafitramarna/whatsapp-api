jest.mock('../src/services/whatsappService', () => ({
  getSession: jest.fn(),
}));

jest.mock('../src/config/env', () => ({
  env: {
    isDev: true,
    isProd: false,
  },
}));

import { startScheduler, stopScheduler } from '../src/services/schedulerService';

describe('Scheduler Service', () => {
  afterEach(() => {
    stopScheduler();
  });

  it('should start scheduler without error', () => {
    expect(() => startScheduler()).not.toThrow();
  });

  it('should stop scheduler without error', () => {
    startScheduler();
    expect(() => stopScheduler()).not.toThrow();
  });

  it('should handle stopScheduler when scheduler was not started', () => {
    expect(() => stopScheduler()).not.toThrow();
  });

  it('should allow start after stop (no leftover state)', () => {
    startScheduler();
    stopScheduler();
    expect(() => startScheduler()).not.toThrow();
    stopScheduler();
  });
});
