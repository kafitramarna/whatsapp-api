'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('sessions')) {
      await queryInterface.createTable('sessions', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        session_id: {
          type: Sequelize.STRING(100),
          allowNull: false,
          unique: true,
          comment: 'Unique session identifier for WhatsApp connection',
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        status: {
          type: Sequelize.ENUM('disconnected', 'connecting', 'connected', 'qr_ready', 'logged_out'),
          allowNull: false,
          defaultValue: 'disconnected',
        },
        webhook_url: {
          type: Sequelize.STRING(500),
          allowNull: true,
          comment: 'Webhook URL for receiving message events',
        },
        webhook_secret: {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: 'HMAC secret for webhook payload signing',
        },
        webhook_events: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'JSON array of event types to filter. Empty/null = all events',
        },
        phone_number: {
          type: Sequelize.STRING(20),
          allowNull: true,
          comment: 'WhatsApp phone number when connected',
        },
        name: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'WhatsApp display name',
        },
        last_connected: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        reconnect_attempts: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: 'Number of reconnection attempts',
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      });

      await queryInterface.addIndex('sessions', ['session_id'], {
        name: 'idx_session_id',
        unique: true,
      });
    } else {
      // Table exists — add missing columns
      const columns = await queryInterface.describeTable('sessions');

      if (!columns.webhook_secret) {
        await queryInterface.addColumn('sessions', 'webhook_secret', {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: 'HMAC secret for webhook payload signing',
        });
      }

      if (!columns.webhook_events) {
        await queryInterface.addColumn('sessions', 'webhook_events', {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'JSON array of event types to filter. Empty/null = all events',
        });
      }

      if (!columns.phone_number) {
        await queryInterface.addColumn('sessions', 'phone_number', {
          type: Sequelize.STRING(20),
          allowNull: true,
          comment: 'WhatsApp phone number when connected',
        });
      }

      if (!columns.name) {
        await queryInterface.addColumn('sessions', 'name', {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'WhatsApp display name',
        });
      }

      if (!columns.last_connected) {
        await queryInterface.addColumn('sessions', 'last_connected', {
          type: Sequelize.DATE,
          allowNull: true,
        });
      }

      if (!columns.reconnect_attempts) {
        await queryInterface.addColumn('sessions', 'reconnect_attempts', {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: 'Number of reconnection attempts',
        });
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sessions');
  },
};
