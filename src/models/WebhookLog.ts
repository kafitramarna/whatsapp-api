import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
} from 'sequelize-typescript';

export enum WebhookLogStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  RETRYING = 'retrying',
}

@Table({
  tableName: 'webhook_logs',
  timestamps: true,
  indexes: [
    { name: 'idx_webhook_log_session', fields: ['session_id'] },
    { name: 'idx_webhook_log_status', fields: ['status'] },
  ],
})
export class WebhookLog extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
    comment: 'Session identifier this log belongs to',
  })
  declare session_id: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: false,
    comment: 'Endpoint URL that was called',
  })
  declare endpoint_url: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
    comment: 'Event type (e.g., message.received)',
  })
  declare event: string;

  @Column({
    type: DataType.TEXT('long'),
    allowNull: false,
    comment: 'JSON payload sent to endpoint',
  })
  declare payload: string;

  @Column({
    type: DataType.ENUM(...Object.values(WebhookLogStatus)),
    allowNull: false,
    defaultValue: WebhookLogStatus.PENDING,
  })
  declare status: WebhookLogStatus;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
    comment: 'Number of delivery attempts',
  })
  declare attempts: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare last_attempt_at: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    comment: 'Next scheduled retry time',
  })
  declare next_retry_at: Date | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    comment: 'HTTP response status code from endpoint',
  })
  declare response_status: number | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: 'Error message if delivery failed',
  })
  declare error_message: string | null;
}

export default WebhookLog;
