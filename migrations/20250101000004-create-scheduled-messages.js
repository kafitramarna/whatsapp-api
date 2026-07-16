'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('scheduled_messages')) {
      await queryInterface.createTable('scheduled_messages', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
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
        session_id: {
          type: Sequelize.STRING(100),
          allowNull: false,
        },
        recipient: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: 'Recipient phone number or group JID',
        },
        recipient_type: {
          type: Sequelize.ENUM('individual', 'group'),
          defaultValue: 'individual',
        },
        message: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        media: {
          type: Sequelize.TEXT('long'),
          allowNull: true,
          comment: 'JSON array of media items',
        },
        scheduled_at: {
          type: Sequelize.DATE,
          allowNull: false,
          comment: 'When to send the message',
        },
        status: {
          type: Sequelize.ENUM('pending', 'processing', 'sent', 'failed', 'cancelled'),
          defaultValue: 'pending',
        },
        error: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Error message if sending failed',
        },
        sent_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'When the message was actually sent',
        },
        wa_message_id: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'WhatsApp message ID after sending',
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
    await queryInterface.dropTable('scheduled_messages');
  },
};
