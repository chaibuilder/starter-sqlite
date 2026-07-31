import { randomUUID } from 'node:crypto';
import type { PgDbClient } from './db';
import { DEFAULT_APP_THEME, DEFAULT_BLOCKS, getDefaultHomeSeo } from './defaults';

/**
 * Insert a new app: `apps`, `apps_online`, `app_users`, and a default homepage
 * (`app_pages` + `app_pages_online`). Returns the new app id — the value the
 * user pastes into `CHAIBUILDER_APP_KEY`.
 *
 * Ported from `createAppRecord` in the ChaiBuilder CLI
 * (github.com/chaibuilder/cli, `src/lib/app-record.ts`); the row shapes must
 * stay identical so both paths produce the same site. The `app_users` row is
 * what makes the new user an admin of this app.
 *
 * Identifiers are double-quoted throughout. The ChaiBuilder schema names its
 * columns in camelCase, and Postgres folds unquoted identifiers to lower case —
 * `fallbackLang` would look for a `fallbacklang` column that does not exist.
 * `user` needs the quotes for a second reason: it is a reserved word.
 */
export async function createAppRecord(
  client: PgDbClient,
  opts: { appName: string; userId: string },
): Promise<{ appId: string }> {
  const { appName, userId } = opts
  const theme = JSON.stringify(DEFAULT_APP_THEME)

  const appsResult = await client.execute({
    sql: `INSERT INTO apps (id, name, "user", theme, "fallbackLang") VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    args: [randomUUID(), appName, userId, theme, 'en'],
  })
  const appId = appsResult.rows[0]?.id as string
  if (!appId) throw new Error('Failed to retrieve appId after insert')

  await client.execute({
    sql: `INSERT INTO apps_online (id, name, "user", theme, "fallbackLang") VALUES ($1, $2, $3, $4, $5)`,
    args: [appId, appName, userId, theme, 'en'],
  })
  await client.execute({
    sql: `INSERT INTO app_users (id, "user", app, role, permissions) VALUES ($1, $2, $3, $4, $5)`,
    args: [randomUUID(), userId, appId, 'admin', JSON.stringify(['*'])],
  })

  const pageId = randomUUID()
  const homeSeo = JSON.stringify(getDefaultHomeSeo(appName))
  const blocks = JSON.stringify(DEFAULT_BLOCKS)
  await client.execute({
    sql: `INSERT INTO app_pages (id, app, slug, name, "pageType", seo, blocks, online) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    args: [pageId, appId, '/', 'Home', 'page', homeSeo, blocks, true],
  })
  await client.execute({
    sql: `INSERT INTO app_pages_online (id, app, slug, name, "pageType", seo, blocks, online) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    args: [pageId, appId, '/', 'Home', 'page', homeSeo, blocks, true],
  })

  return { appId }
}

/** Look up a user id by email; null if no such user. */
export async function findUserIdByEmail(
  client: PgDbClient,
  email: string,
): Promise<string | null> {
  const res = await client.execute({
    sql: 'SELECT id FROM users WHERE email = $1 LIMIT 1',
    args: [email],
  })
  const id = res.rows[0]?.id
  return id == null ? null : String(id)
}
