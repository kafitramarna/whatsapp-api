/**
 * ScheduledMessage Model
 * 
 * Stores messages scheduled to be sent at a specific time
 */

import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  BeforeValidate,
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { User } from './User';

export enum ScheduledMessageStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Table({
  tableName: 'scheduled_messages',
  timestamps: true,
  underscored: true,
})
export class ScheduledMessage extends Model {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare user_id: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  declare session_id: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    comment: 'Recipient phone number or group JID',
  })
  declare recipient: string;

  @Column({
    type: DataType.ENUM('individual', 'group'),
    defaultValue: 'individual',
  })
  declare recipient_type: 'individual' | 'group';

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare message: string;

  @Column({
    type: DataType.TEXT('long'),
    allowNull: true,
    comment: 'JSON array of media items',
  })
  declare media: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    comment: 'When to send the message',
  })
  declare scheduled_at: Date;

  @Column({
    type: DataType.ENUM(...Object.values(ScheduledMessageStatus)),
    defaultValue: ScheduledMessageStatus.PENDING,
  })
  declare status: ScheduledMessageStatus;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: 'Error message if sending failed',
  })
  declare error: string;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    comment: 'When the message was actually sent',
  })
  declare sent_at: Date;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
    comment: 'WhatsApp message ID after sending',
  })
  declare wa_message_id: string;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;

  // Relationships
  @BelongsTo(() => User)
  declare user: User;

  // Hooks
  @BeforeValidate
  static generateId(msg: ScheduledMessage): void {
    if (!msg.id) {
      msg.id = uuidv4();
    }
  }

  // Helper methods
  getMediaItems(): Array<{ type: string; data: string; caption?: string; filename?: string; mimetype?: string; isAnimated?: boolean; viewOnce?: boolean; ptt?: boolean; quality?: 'standard' | 'hd' }> {
    if (!this.media) return [];
    try {
      return JSON.parse(this.media);
    } catch {
      return [];
    }
  }

  setMediaItems(items: Array<{ type: string; data: string; caption?: string; filename?: string; mimetype?: string; isAnimated?: boolean; viewOnce?: boolean; ptt?: boolean; quality?: 'standard' | 'hd' }>): void {
    this.media = JSON.stringify(items);
  }
}

export default ScheduledMessage;
