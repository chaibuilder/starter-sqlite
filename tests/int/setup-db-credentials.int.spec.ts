// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { describeDbError } from '@/lib/setup/status'
import { openDb, redactDbUrl } from '@/lib/setup/db'
import { resolveDatabase } from '@/payload.config'
import { TEST_DATABASE_URL } from '../helpers/postgres'

/**
 * A Postgres connection string carries its own credentials, which makes it both
 * the thing the wizard must not leak back to the browser and the thing whose
 * failures have to be explained in plain language.
 */
describe('setup database credentials', () => {
  const originalUrl = process.env.DATABASE_URL

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl
  })

  it('uses an override connection instead of the deployment one', () => {
    process.env.DATABASE_URL = 'postgres://deploy:deploy-secret@db.internal:5432/deployment'

    // A connection string typed into the wizard replaces the environment's
    // outright — there are no separate credentials that could be mixed in.
    const typed = resolveDatabase({ url: 'postgres://other:pw@somewhere-else:5432/other' })
    expect(typed.url).toBe('postgres://other:pw@somewhere-else:5432/other')

    const fromEnv = resolveDatabase()
    expect(fromEnv.url).toBe('postgres://deploy:deploy-secret@db.internal:5432/deployment')
  })

  it('masks the password before a connection string can be shown', () => {
    const redacted = redactDbUrl('postgres://deploy:deploy-secret@db.internal:5432/deployment')
    expect(redacted).not.toContain('deploy-secret')
    // Enough is kept to recognise which database it refers to.
    expect(redacted).toContain('db.internal')
    expect(redacted).toContain('deployment')

    // A string that could not be parsed may still hold the password, so it is
    // described rather than echoed.
    expect(redactDbUrl('not a url')).not.toContain('not a url')
  })

  it('explains a rejected password rather than surfacing the raw error', async () => {
    const url = new URL(TEST_DATABASE_URL)
    url.username = 'chai_no_such_role'
    url.password = 'wrong-password'

    const client = openDb({ url: url.toString() })
    try {
      await client.execute('SELECT 1')
      throw new Error('expected the connection to be rejected')
    } catch (error) {
      expect(describeDbError(error)).toContain('rejected those credentials')
    } finally {
      client.close()
    }
  }, 60_000)

  it('explains a database that does not exist', async () => {
    const url = new URL(TEST_DATABASE_URL)
    url.pathname = '/chai_definitely_not_a_database'

    const client = openDb({ url: url.toString() })
    try {
      await client.execute('SELECT 1')
      throw new Error('expected the connection to be rejected')
    } catch (error) {
      expect(describeDbError(error)).toContain('does not exist on the server')
    } finally {
      client.close()
    }
  }, 60_000)

  it('explains an unreachable server', async () => {
    // Port 1 is reserved and nothing listens on it, so this is refused at once.
    const url = new URL(TEST_DATABASE_URL)
    url.port = '1'

    const client = openDb({ url: url.toString() })
    try {
      await client.execute('SELECT 1')
      throw new Error('expected the connection to be refused')
    } catch (error) {
      expect(describeDbError(error)).toContain('Could not reach the database')
    } finally {
      client.close()
    }
  }, 60_000)
})
