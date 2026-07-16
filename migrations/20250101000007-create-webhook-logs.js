'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('webhook_logs')) {
      await queryInterface.createTable('webhook_logs', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        session_id: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: 'Session identifier this log belongs to',
        },
        endpoint_url: {
          type: Sequelize.STRING(500),
          allowNull: false,
          comment: 'Endpoint URL that was called',
        },
        event: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: 'Event type (e.g., message.received)',
        },
        payload: {
          type: Sequelize.TEXT('long'),
          allowNull: false,
          comment: 'JSON payload sent to endpoint',
        },
        status: {
          type: Sequelize.ENUM('pending', 'success', 'failed', 'retrying'),
          allowNull: false,
          defaultValue: 'pending',
        },
        attempts: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: 'Number of delivery attempts',
        },
        last_attempt_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        next_retry_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Next scheduled retry time',
        },
        response_status: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: 'HTTP response status code from endpoint',
        },
        error_message: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Error message if delivery failed',
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

      await queryInterface.addIndex('webhook_logs', ['session_id'], {
        name: 'idx_webhook_log_session',
      });

      await queryInterface.addIndex('webhook_logs', ['status'], {
        name: 'idx_webhook_log_status',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('webhook_logs');
  },
};
