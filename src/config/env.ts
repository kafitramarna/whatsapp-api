import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production',

  // Database
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    name: process.env.DB_NAME || 'whatsapp_api',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // WhatsApp
  wa: {
    reconnectInterval: parseInt(process.env.WA_RECONNECT_INTERVAL || '5000', 10),
    maxReconnectRetries: parseInt(process.env.WA_MAX_RECONNECT_RETRIES || '5', 10),
  },
} as const;

// Validate required environment variables
export function validateEnv(): void {
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0 && env.isProd) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export default env;
