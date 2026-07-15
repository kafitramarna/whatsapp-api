import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Unique,
  ForeignKey,
  BelongsTo,
  Default,
} from 'sequelize-typescript';
import { User } from './User';

/**
 * Session Status Enum
 */
export enum SessionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  QR_READY = 'qr_ready',
  LOGGED_OUT = 'logged_out',
}

/**
 * Session Model
 * Represents a WhatsApp session that belongs to a user
 */
@Table({
  tableName: 'sessions',
  timestamps: true,
  indexes: [
    {
      name: 'idx_session_id',
      fields: ['session_id'],
      unique: true,
    },
  ],
})
export class Session extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Unique
  @Column({
    type: DataType.STRING(100),
    allowNull: false,
    comment: 'Unique session identifier for WhatsApp connection',
  })
  declare session_id: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare user_id: string;

  @Default(SessionStatus.DISCONNECTED)
  @Column({
    type: DataType.ENUM(...Object.values(SessionStatus)),
    allowNull: false,
  })
  declare status: SessionStatus;

  @Column({
    type: DataType.STRING(500),
    allowNull: true,
    comment: 'Webhook URL for receiving message events',
  })
  declare webhook_url: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
    comment: 'HMAC secret for webhook payload signing',
  })
  declare webhook_secret: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: 'JSON array of event types to filter. Empty/null = all events',
  })
  declare webhook_events: string | null;

  @Column({
    type: DataType.STRING(20),
    allowNull: true,
    comment: 'WhatsApp phone number when connected',
  })
  declare phone_number: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
    comment: 'WhatsApp display name',
  })
  declare name: string;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare last_connected: Date;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
    comment: 'Number of reconnection attempts',
  })
  declare reconnect_attempts: number;

  // Relationship: Session belongs to User
  @BelongsTo(() => User)
  declare user: User;

  // NOTE: AuthKey relationship removed - AuthKey uses session_id as string reference
  // not as a foreign key (due to type mismatch: session_id is string, id is integer)

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.status === SessionStatus.CONNECTED;
  }

  /**
   * Update session status
   */
  async updateStatus(status: SessionStatus): Promise<void> {
    this.status = status;
    if (status === SessionStatus.CONNECTED) {
      this.last_connected = new Date();
      this.reconnect_attempts = 0;
    }
    await this.save();
  }

  /**
   * Increment reconnect attempts
   */
  async incrementReconnectAttempts(): Promise<number> {
    this.reconnect_attempts += 1;
    await this.save();
    return this.reconnect_attempts;
  }
}

export default Session;
