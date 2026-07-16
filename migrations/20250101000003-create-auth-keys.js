'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('auth_keys')) {
      await queryInterface.createTable('auth_keys', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        session_id: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: 'Session identifier this key belongs to',
        },
        type: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: 'Type of auth data (creds, app-state-sync-key-*, etc)',
        },
        value: {
          type: Sequelize.TEXT('long'),
          allowNull: false,
          comment: 'JSON-serialized auth data with Buffer support',
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

      await queryInterface.addIndex('auth_keys', ['session_id'], {
        name: 'idx_session_id',
      });

      await queryInterface.addIndex('auth_keys', ['session_id', 'type'], {
        name: 'idx_session_type',
        unique: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('auth_keys');
  },
};
