import { Client } from 'pg'

/**
 * Postgres server the integration tests run against.
 *
 * Tests need a real server — Postgres has no file-backed mode to stand in for
 * the SQLite file this replaced. The default matches a stock local install;
 * point `TEST_DATABASE_URL` somewhere else (a container, a CI service) to
 * override it. It must never be the `DATABASE_URL` from `.env`: these helpers
 * drop and recreate schemas.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://postgres@127.0.0.1:5432/chai_test'

/** The same server, but a differently named database — for suites needing isolation. */
export function testDatabaseUrl(suffix: string): string {
  const url = new URL(TEST_DATABASE_URL)
  url.pathname = `${url.pathname.replace(/^\//, '')}_${suffix}`
  return url.toString()
}

/** A connection to the server's `postgres` maintenance database, for CREATE/DROP DATABASE. */
function maintenanceUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl)
  url.pathname = '/postgres'
  return url.toString()
}

function databaseNameOf(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''))
}

/**
 * Give a suite an empty database to work in.
 *
 * Creates it if it is not there, then drops and recreates the `public` schema so
 * fixed-slug fixtures start clean. Recreating the schema rather than the whole
 * database means an open connection from an earlier suite cannot block the
 * reset, which `DROP DATABASE` would.
 */
export async function resetTestDatabase(databaseUrl: string = TEST_DATABASE_URL): Promise<void> {
  const name = databaseNameOf(databaseUrl)
  const admin = new Client({ connectionString: maintenanceUrl(databaseUrl) })
  await admin.connect()
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (existing.rowCount === 0) {
      // Identifiers cannot be parameterised, so the name is quoted instead. It
      // comes from this file's own configuration, not from test input.
      await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`)
    }
  } finally {
    await admin.end()
  }

  const db = new Client({ connectionString: databaseUrl })
  await db.connect()
  try {
    await db.query('DROP SCHEMA IF EXISTS public CASCADE')
    await db.query('CREATE SCHEMA public')
  } finally {
    await db.end()
  }
}
