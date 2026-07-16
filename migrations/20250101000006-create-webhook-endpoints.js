'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('webhook_endpoints')) {
      await queryInterface.createTable('webhook_endpoints', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        session_id: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: 'Session identifier this endpoint belongs to',
        },
        url: {
          type: Sequelize.STRING(500),
          allowNull: false,
          comment: 'Webhook endpoint URL',
        },
        secret: {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: 'HMAC secret for this endpoint',
        },
        events: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'JSON array of event types to receive. Empty/null = all events',
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
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

      await queryInterface.addIndex('webhook_endpoints', ['session_id'], {
        name: 'idx_webhook_endpoint_session',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('webhook_endpoints');
  },
};
