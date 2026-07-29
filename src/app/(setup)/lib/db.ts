import { Client } from 'pg'

export type DbCredentials = { url: string }

/** A statement, either bare or with `$1`-style positional parameters. */
export type DbQuery = string | { sql: string; args?: unknown[] }

export type DbResult = { rows: Record<string, unknown>[] }

/**
 * Raw Postgres client, used by setup and the status page.
 *
 * Deliberately independent of Payload: status checks have to work even when
 * Payload itself cannot boot (unmigrated schema, missing secret), and the wizard
 * connects with credentials that are not yet in the environment.
 *
 * TLS is left to the connection string. `pg` reads `sslmode` from the URL and
 * that setting wins over anything passed here, so honouring it is both the
 * standard Postgres behaviour and the only one that actually takes effect —
 * hosted providers hand out URLs that already carry `?sslmode=require`.
 */
export class PgDbClient {
  private readonly client: Client
  private connecting: Promise<void> | null = null
  private closed = false

  constructor(credentials: DbCredentials) {
    this.client = new Client({
      connectionString: credentials.url,
      // Setup runs in front of a user waiting on a form: fail fast on an
      // unreachable host instead of leaving the page spinning.
      connectionTimeoutMillis: 15_000,
    })
  }

  async execute(query: DbQuery): Promise<DbResult> {
    if (this.closed) throw new Error('Database client is already closed')
    if (!this.connecting) this.connecting = this.client.connect().then(() => undefined)
    await this.connecting

    const { sql, args } = typeof query === 'string' ? { sql: query, args: undefined } : query
    const result = await this.client.query(sql, args as unknown[] | undefined)
    return { rows: (result.rows ?? []) as Record<string, unknown>[] }
  }

  /**
   * Release the connection. Callers close from `finally` blocks where the
   * interesting error is the one already in flight, so a failure to close
   * cleanly is swallowed rather than allowed to mask it.
   */
  close(): void {
    if (this.closed) return
    this.closed = true
    const connecting = this.connecting
    if (!connecting) return
    void connecting.then(() => this.client.end()).catch(() => {})
  }
}

/** Open a single-use connection. It is established lazily, on the first query. */
export function openDb(credentials: DbCredentials): PgDbClient {
  return new PgDbClient(credentials)
}

/** Credentials from the environment; null when the deployment has no database yet. */
export function envDbCredentials(): DbCredentials | null {
  const url = process.env.DATABASE_URL
  if (!url) return null
  return { url }
}

/**
 * A connection string with its password masked, safe to render.
 *
 * A Postgres URL carries the password inline, so unlike the libSQL address this
 * replaced it must never be shown to the browser as-is. Enough is kept — user,
 * host, database — for someone to recognise which database it refers to. An
 * unparseable string is reported as such rather than echoed, since a value that
 * failed to parse may still contain the password.
 */
export function redactDbUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return '(unreadable connection string)'
  }
  if (parsed.password) parsed.password = '****'
  return parsed.toString()
}
