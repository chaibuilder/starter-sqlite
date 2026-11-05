import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`app_theme_revisions\` (
  	\`uid\` text PRIMARY KEY NOT NULL,
  	\`app\` text NOT NULL,
  	\`theme\` text,
  	\`designTokens\` text,
  	\`type\` text,
  	\`currentEditor\` text,
  	\`createdAt\` text DEFAULT (datetime('now')) NOT NULL,
  	FOREIGN KEY (\`app\`) REFERENCES \`apps\`(\`id\`) ON UPDATE no action ON DELETE no action
  );
  `)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_ai_logs\` (
  	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  	\`createdAt\` text DEFAULT (datetime('now')) NOT NULL,
  	\`model\` text,
  	\`totalDuration\` real,
  	\`error\` text,
  	\`totalTokens\` real,
  	\`tokenUsage\` text,
  	\`user\` text,
  	\`client\` text,
  	\`cost\` real DEFAULT 0,
  	\`prompt\` text,
  	\`app\` text,
  	\`creditSource\` text DEFAULT 'monthly',
  	\`addonId\` text
  );
  `)
  await db.run(sql`INSERT INTO \`__new_ai_logs\`("id", "createdAt", "model", "totalDuration", "error", "totalTokens", "tokenUsage", "user", "client", "cost", "prompt", "app", "creditSource", "addonId") SELECT "id", "createdAt", "model", "totalDuration", "error", "totalTokens", "tokenUsage", "user", "client", "cost", "prompt", "app", "creditSource", "addonId" FROM \`ai_logs\`;`)
  await db.run(sql`DROP TABLE \`ai_logs\`;`)
  await db.run(sql`ALTER TABLE \`__new_ai_logs\` RENAME TO \`ai_logs\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`ai_logs_addon_id_idx\` ON \`ai_logs\` (\`addonId\`);`)
  await db.run(sql`CREATE INDEX \`ai_logs_credit_source_idx\` ON \`ai_logs\` (\`creditSource\`);`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`reset_password_requested_at\` text;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`_objectkey\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`app_theme_revisions\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_ai_logs\` (
  	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  	\`createdAt\` text DEFAULT (datetime('now')) NOT NULL,
  	\`model\` text,
  	\`totalDuration\` real,
  	\`error\` text,
  	\`totalTokens\` real,
  	\`tokenUsage\` text,
  	\`user\` text,
  	\`client\` text,
  	\`cost\` real DEFAULT 0,
  	\`prompt\` text,
  	\`app\` text,
  	\`creditSource\` text DEFAULT 'monthly',
  	\`addonId\` text,
  	FOREIGN KEY (\`app\`) REFERENCES \`apps\`(\`id\`) ON UPDATE no action ON DELETE no action,
  	FOREIGN KEY (\`client\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE no action
  );
  `)
  await db.run(sql`INSERT INTO \`__new_ai_logs\`("id", "createdAt", "model", "totalDuration", "error", "totalTokens", "tokenUsage", "user", "client", "cost", "prompt", "app", "creditSource", "addonId") SELECT "id", "createdAt", "model", "totalDuration", "error", "totalTokens", "tokenUsage", "user", "client", "cost", "prompt", "app", "creditSource", "addonId" FROM \`ai_logs\`;`)
  await db.run(sql`DROP TABLE \`ai_logs\`;`)
  await db.run(sql`ALTER TABLE \`__new_ai_logs\` RENAME TO \`ai_logs\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`ai_logs_addon_id_idx\` ON \`ai_logs\` (\`addonId\`);`)
  await db.run(sql`CREATE INDEX \`ai_logs_credit_source_idx\` ON \`ai_logs\` (\`creditSource\`);`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`reset_password_requested_at\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`_objectkey\`;`)
}
