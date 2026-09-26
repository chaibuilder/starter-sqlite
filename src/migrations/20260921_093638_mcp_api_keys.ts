import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`ai_page_edits\` (
  	\`pageId\` text PRIMARY KEY NOT NULL,
  	\`app\` text NOT NULL,
  	\`userId\` text NOT NULL,
  	\`tokenId\` text,
  	\`tokenLabel\` text DEFAULT '' NOT NULL,
  	\`lastTool\` text DEFAULT '' NOT NULL,
  	\`startedAt\` text DEFAULT (datetime('now')) NOT NULL,
  	\`lastActivityAt\` text DEFAULT (datetime('now')) NOT NULL,
  	\`expiresAt\` text NOT NULL,
  	FOREIGN KEY (\`pageId\`) REFERENCES \`app_pages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`app\`) REFERENCES \`apps\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`ai_page_edits_app_idx\` ON \`ai_page_edits\` (\`app\`);`)
  await db.run(sql`ALTER TABLE \`app_pages_online\` ADD \`source\` text;`)
  await db.run(sql`ALTER TABLE \`app_pages_revisions\` ADD \`source\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`enable_a_p_i_key\` integer;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`api_key\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`api_key_index\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`ai_page_edits\`;`)
  await db.run(sql`ALTER TABLE \`app_pages_online\` DROP COLUMN \`source\`;`)
  await db.run(sql`ALTER TABLE \`app_pages_revisions\` DROP COLUMN \`source\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`enable_a_p_i_key\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`api_key\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`api_key_index\`;`)
}
