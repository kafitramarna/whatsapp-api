import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
} from 'sequelize-typescript';

@Table({
  tableName: 'webhook_endpoints',
  timestamps: true,
  indexes: [
    { name: 'idx_webhook_endpoint_session', fields: ['session_id'] },
  ],
})
export class WebhookEndpoint extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
    comment: 'Session identifier this endpoint belongs to',
  })
  declare session_id: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: false,
    comment: 'Webhook endpoint URL',
  })
  declare url: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
    comment: 'HMAC secret for this endpoint',
  })
  declare secret: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: 'JSON array of event types to receive. Empty/null = all events',
  })
  declare events: string | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  declare is_active: boolean;

  getEventList(): string[] {
    if (!this.events) return [];
    try {
      return JSON.parse(this.events);
    } catch {
      return [];
    }
  }

  setEventList(events: string[]): void {
    this.events = JSON.stringify(events);
  }

  shouldReceiveEvent(event: string): boolean {
    const list = this.getEventList();
    return list.length === 0 || list.includes(event);
  }
}

export default WebhookEndpoint;
