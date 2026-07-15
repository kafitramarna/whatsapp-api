// IMPORTANT: reflect-metadata must be imported before any decorator usage
import 'reflect-metadata';

import { Sequelize } from 'sequelize-typescript';
import { env } from './env';

// Import models explicitly
import { User } from '../models/User';
import { Session } from '../models/Session';
import { AuthKey } from '../models/AuthKey';
import { ScheduledMessage } from '../models/ScheduledMessage';
import { ApiLog } from '../models/ApiLog';

// Create Sequelize instance with MySQL
export const sequelize = new Sequelize({
  dialect: 'mysql',
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  username: env.db.user,
  password: env.db.password,

  // Register models explicitly
  models: [User, Session, AuthKey, ScheduledMessage, ApiLog],

  // Logging configuration
  logging: env.isDev ? console.log : false,

  // Connection pool settings for production
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },

  // Timezone configuration
  timezone: '+07:00',

  // Additional options
  define: {
    timestamps: true,
    underscored: true, // Use snake_case for column names
    freezeTableName: true,
  },
});

/**
 * Initialize database connection and sync models
 */
export async function initDatabase(): Promise<void> {
  try {
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');

    // Sync all models (create tables if not exist)
    // In production, use migrations instead
    if (env.isDev) {
      // Disabled alter to prevent ER_TOO_MANY_KEYS loop
      await sequelize.sync({ alter: false });
      console.log('✅ Database models synchronized.');
    } else {
      await sequelize.sync();
      console.log('✅ Database models synchronized (production mode).');
    }
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    throw error;
  }
}

/**
 * Close database connection gracefully
 */
export async function closeDatabase(): Promise<void> {
  try {
    await sequelize.close();
    console.log('✅ Database connection closed.');
  } catch (error) {
    console.error('❌ Error closing database connection:', error);
    throw error;
  }
}

export default sequelize;
