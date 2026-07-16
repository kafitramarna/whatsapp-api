'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('api_logs')) {
      await queryInterface.createTable('api_logs', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        method: {
          type: Sequelize.STRING(10),
          allowNull: false,
        },
        endpoint: {
          type: Sequelize.STRING(500),
          allowNull: false,
        },
        status_code: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        user_id: {
          type: Sequelize.STRING(64),
          allowNull: true,
        },
        username: {
          type: Sequelize.STRING(100),
          allowNull: true,
        },
        user_agent: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        ip_address: {
          type: Sequelize.STRING(45),
          allowNull: true,
        },
        request_body: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        error_message: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        stack_trace: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        response_time_ms: {
          type: Sequelize.FLOAT,
          allowNull: true,
        },
        is_error: {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
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

      await queryInterface.addIndex('api_logs', ['method']);
      await queryInterface.addIndex('api_logs', ['endpoint']);
      await queryInterface.addIndex('api_logs', ['created_at']);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('api_logs');
  },
};
