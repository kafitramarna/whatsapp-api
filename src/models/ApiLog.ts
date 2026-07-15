import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AllowNull,
  Default,
  Index,
} from 'sequelize-typescript';

@Table({
  tableName: 'api_logs',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['created_at'] },
  ],
})
export class ApiLog extends Model {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Index
  @AllowNull(false)
  @Column(DataType.STRING(10))
  declare method: string;

  @Index
  @AllowNull(false)
  @Column(DataType.STRING(500))
  declare endpoint: string;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  declare status_code: number;

  @AllowNull(true)
  @Column(DataType.STRING(64))
  declare user_id: string;

  @AllowNull(true)
  @Column(DataType.STRING(100))
  declare username: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare user_agent: string;

  @AllowNull(true)
  @Column(DataType.STRING(45))
  declare ip_address: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare request_body: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare error_message: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  declare stack_trace: string;

  @AllowNull(true)
  @Column(DataType.FLOAT)
  declare response_time_ms: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  declare is_error: boolean;
}

export default ApiLog;
