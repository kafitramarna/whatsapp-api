import dotenv from 'dotenv';
import path from 'path';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function migrate() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASS || '';
  const database = process.env.DB_NAME || 'whatsapp_api';

  const conn = await mysql.createConnection({ host, port, user, password, database });

  // Check existing columns
  const [rows] = await conn.execute(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sessions'",
    [database]
  );
  const existing = new Set((rows as any[]).map((r) => r.COLUMN_NAME));

  const migrations: string[] = [];

  if (!existing.has('webhook_secret')) {
    migrations.push("ALTER TABLE `sessions` ADD COLUMN `webhook_secret` VARCHAR(255) NULL COMMENT 'HMAC secret for webhook payload signing'");
  }

  if (!existing.has('webhook_events')) {
    migrations.push("ALTER TABLE `sessions` ADD COLUMN `webhook_events` TEXT NULL COMMENT 'JSON array of event types to filter. Empty/null = all events'");
  }

  if (!existing.has('phone_number')) {
    migrations.push("ALTER TABLE `sessions` ADD COLUMN `phone_number` VARCHAR(20) NULL COMMENT 'WhatsApp phone number when connected'");
  }

  if (!existing.has('name')) {
    migrations.push("ALTER TABLE `sessions` ADD COLUMN `name` VARCHAR(100) NULL COMMENT 'WhatsApp display name'");
  }

  if (!existing.has('last_connected')) {
    migrations.push("ALTER TABLE `sessions` ADD COLUMN `last_connected` DATETIME NULL");
  }

  if (!existing.has('reconnect_attempts')) {
    migrations.push("ALTER TABLE `sessions` ADD COLUMN `reconnect_attempts` INT DEFAULT 0 COMMENT 'Number of reconnection attempts'");
  }

  if (migrations.length === 0) {
    console.log('✅ All columns already exist. No migration needed.');
  } else {
    for (const sql of migrations) {
      console.log(`Running: ${sql}`);
      await conn.execute(sql);
    }
    console.log(`✅ Migration complete. Added ${migrations.length} column(s).`);
  }

  await conn.end();
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
