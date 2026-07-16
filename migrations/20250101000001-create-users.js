'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('users')) {
      await queryInterface.createTable('users', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        username: {
          type: Sequelize.STRING(100),
          allowNull: false,
          unique: true,
        },
        email: {
          type: Sequelize.STRING(255),
          allowNull: true,
          unique: true,
          comment: 'User email address',
        },
        password: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        api_key: {
          type: Sequelize.STRING(255),
          allowNull: true,
          unique: true,
          comment: 'API key for authentication',
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          defaultValue: true,
        },
        role: {
          type: Sequelize.ENUM('admin', 'user'),
          defaultValue: 'user',
          comment: 'User role for access control',
        },
        last_login: {
          type: Sequelize.DATE,
          allowNull: true,
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
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
  },
};
