import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Unique,
  HasMany,
  BeforeCreate,
  BeforeUpdate,
} from 'sequelize-typescript';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { Session } from './Session';

/**
 * User Model
 * Represents a user who can have multiple WhatsApp sessions
 */
@Table({
  tableName: 'users',
  timestamps: true,
})
export class User extends Model {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Unique
  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  declare username: string;

  @Unique
  @Column({
    type: DataType.STRING(255),
    allowNull: true,
    comment: 'User email address',
  })
  declare email: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare password: string;

  @Unique
  @Column({
    type: DataType.STRING(255),
    allowNull: true,
    comment: 'API key for authentication',
  })
  declare api_key: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  declare is_active: boolean;

  @Column({
    type: DataType.ENUM('admin', 'user'),
    defaultValue: 'user',
    comment: 'User role for access control',
  })
  declare role: 'admin' | 'user';

  @Column(DataType.DATE)
  declare last_login: Date;

  // Relationship: User has many Sessions
  @HasMany(() => Session)
  declare sessions: Session[];

  /**
   * Hook: Generate UUID and API key before creating a new user
   */
  @BeforeCreate
  static generateApiKey(user: User): void {
    if (!user.id) {
      user.id = uuidv4();
    }
    if (!user.api_key) {
      user.api_key = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
    }
  }

  /**
   * Hook: Hash password before creating user
   */
  @BeforeCreate
  static async hashPassword(user: User): Promise<void> {
    if (user.password && !user.password.startsWith('$2b$')) {
      user.password = await bcrypt.hash(user.password, 12);
    }
  }

  /**
   * Hook: Hash password if changed on update
   */
  @BeforeUpdate
  static async hashPasswordOnUpdate(user: User): Promise<void> {
    if (user.changed('password') && !user.password.startsWith('$2b$')) {
      user.password = await bcrypt.hash(user.password, 12);
    }
  }

  /**
   * Verify password
   */
  async verifyPassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password);
  }

  /**
   * Regenerate API key
   * Returns the new plaintext key
   */
  async regenerateApiKey(): Promise<string> {
    this.api_key = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
    await this.save();
    return this.api_key;
  }

  /**
   * Hide password in JSON output
   */
  toJSON(): object {
    const values = { ...this.get() };
    delete (values as Record<string, unknown>).password;
    return values;
  }

  /**
   * Mask API key for display (show only last 4 chars)
   */
  getMaskedApiKey(): string {
    if (!this.api_key) return '****';
    return '****' + this.api_key.slice(-4);
  }

  /**
   * Static: Find user by API key
   */
  static async findByApiKey(apiKey: string): Promise<User | null> {
    return User.findOne({
      where: {
        api_key: apiKey,
        is_active: true,
      },
    });
  }
}

export default User;
