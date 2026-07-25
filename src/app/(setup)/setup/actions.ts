'use server'

import { getPayload, type Migration } from 'payload'
import { buildPayloadConfig } from '@/payload.config'
import { isConfigured } from '@/lib/is-configured'
import { createAppRecord, findUserIdByEmail } from '@/lib/setup/create-app-record'
import { describeDbError } from '@/lib/setup/status'
import { openDb } from '@/lib/setup/db'
import { migrations } from '@/migrations'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export type SetupInput = {
  url: string
  authToken?: string
  appName: string
  email: string
  password: string
}

/**
 * A throwaway secret for the wizard's Payload instance. Password hashes do not
 * depend on it — Payload stores a salt and hash on the user row — so the account
 * created here still works once the real PAYLOAD_SECRET is in place.
 */
const TRANSIENT_SECRET = 'chai-setup-transient-secret'

/** Reject setup requests on a deployment that is already configured. */
function guard(): string | null {
  return isConfigured()
    ? 'This site is already set up. Remove its environment variables before running setup again.'
    : null
}

/** Verify the database credentials the user pasted, before they go any further. */
export async function testConnection(credentials: {
  url: string
  authToken?: string
}): Promise<ActionResult<{ message: string }>> {
  const blocked = guard()
  if (blocked) return { ok: false, error: blocked }

  if (!credentials.url) return { ok: false, error: 'Enter a database URL.' }

  const client = openDb(credentials)
  try {
    await client.execute('SELECT 1')
    return { ok: true, data: { message: 'Connected to your database.' } }
  } catch (error) {
    return { ok: false, error: describeDbError(error) }
  } finally {
    client.close()
  }
}

/**
 * Create the site: migrate the database, create (or reuse) the admin account,
 * then seed the app record. This mirrors `chaibuilder-app create` in the CLI, so
 * the resulting database is the same either way.
 *
 * Credentials arrive with the request and are never persisted — the user copies
 * them into their host's environment variables at the end of the wizard.
 */
export async function runSetup(input: SetupInput): Promise<ActionResult<{ appId: string }>> {
  const blocked = guard()
  if (blocked) return { ok: false, error: blocked }

  const appName = input.appName.trim()
  const email = input.email.trim().toLowerCase()

  if (!input.url) return { ok: false, error: 'Enter a database URL.' }
  if (!appName) return { ok: false, error: 'Enter a name for your site.' }
  if (!email) return { ok: false, error: 'Enter an email address.' }
  if (!input.password || input.password.length < 4) {
    return { ok: false, error: 'Password must be at least 4 characters.' }
  }

  let payload: Awaited<ReturnType<typeof getPayload>>
  try {
    payload = await getPayload({
      config: buildPayloadConfig({
        databaseUrl: input.url,
        databaseAuthToken: input.authToken,
        secret: TRANSIENT_SECRET,
      }),
      // `getPayload` caches instances by key. The wizard connects to a database
      // that is not in the environment, so it must not take over the default
      // instance — key it by target database instead.
      key: `setup:${input.url}`,
    })
  } catch (error) {
    return { ok: false, error: describeDbError(error) }
  }

  try {
    // Pass the migrations explicitly: the default path reads migration files
    // from disk, which is not reliable inside a bundled serverless deployment.
    // The cast bridges Payload's `(args: unknown)` migration signature and the
    // typed arguments its own generator emits.
    await payload.db.migrate({ migrations: migrations as unknown as Migration[] })
  } catch (error) {
    return {
      ok: false,
      error: `Could not create the database tables: ${describeDbError(error)}`,
    }
  }

  // Reuse an existing account when the email is already taken, matching the
  // CLI's behaviour — but only when the password proves ownership.
  let userId: string
  try {
    const client = openDb({ url: input.url, authToken: input.authToken })
    let existingId: string | null = null
    try {
      existingId = await findUserIdByEmail(client, email)
    } finally {
      client.close()
    }

    if (existingId) {
      try {
        await payload.login({
          collection: 'users',
          data: { email, password: input.password },
        })
      } catch {
        return {
          ok: false,
          error:
            'An account with that email already exists in this database, and the password does not match. Use the existing password, or a different email.',
        }
      }
      userId = existingId
    } else {
      const created = await payload.create({
        collection: 'users',
        data: { email, password: input.password },
      })
      userId = String(created.id)
    }
  } catch (error) {
    return { ok: false, error: `Could not create the admin account: ${describeDbError(error)}` }
  }

  const client = openDb({ url: input.url, authToken: input.authToken })
  try {
    const existing = await client.execute('SELECT id FROM apps LIMIT 1')
    if (existing.rows[0]?.id) {
      // Setup was already run against this database; reuse it rather than
      // creating a second site the user did not ask for.
      return { ok: true, data: { appId: String(existing.rows[0].id) } }
    }

    const { appId } = await createAppRecord(client, { appName, userId })
    return { ok: true, data: { appId } }
  } catch (error) {
    return { ok: false, error: `Could not create your site: ${describeDbError(error)}` }
  } finally {
    client.close()
  }
}
