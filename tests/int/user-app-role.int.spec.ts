// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { sql, type MigrateUpArgs } from '@payloadcms/db-sqlite'
import { createLocalReq, getPayload, initTransaction, killTransaction, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import config from '@/payload.config'

// Saving a user from the admin sends the virtual `appRole` field, and the Users afterChange
// hook writes it to `app_users` while Payload's update transaction is still open. That write
// must go through the same transaction: on remote libSQL (Turso) a write from a second
// connection waits on the open transaction's lock and fails as "database is locked".
describe('Users appRole persistence', () => {
  let payload: Payload
  let db: MigrateUpArgs['db']
  const appId = `test-app-${randomUUID()}`
  const previousAppKey = process.env.CHAIBUILDER_APP_KEY

  beforeAll(async () => {
    process.env.CHAIBUILDER_APP_KEY = appId
    payload = await getPayload({ config: await config })
    db = (payload.db as unknown as { drizzle: MigrateUpArgs['db'] }).drizzle
    await db.run(sql`INSERT INTO "apps" ("id", "name") VALUES (${appId}, 'Test app')`)
  })

  afterAll(async () => {
    await db.run(sql`DELETE FROM "app_users" WHERE "app" = ${appId}`)
    await db.run(sql`DELETE FROM "apps" WHERE "id" = ${appId}`)
    process.env.CHAIBUILDER_APP_KEY = previousAppKey
  })

  const appUsersRows = (userId: string) =>
    db.all<{ role: string; status: string }>(
      sql`SELECT "role", "status" FROM "app_users" WHERE "user" = ${userId} AND "app" = ${appId}`,
    )

  it('enables an API key and writes the app role in the same save', async () => {
    const user = await payload.create({
      collection: 'users',
      data: { email: `api-key-${Date.now()}@example.com`, password: 'password123' },
    })

    const apiKey = randomUUID()
    const updated = await payload.update({
      collection: 'users',
      id: user.id,
      data: { enableAPIKey: true, apiKey, appRole: 'admin' },
    })

    expect(updated.enableAPIKey).toBe(true)
    expect(await appUsersRows(String(user.id))).toEqual([{ role: 'admin', status: 'active' }])

    const { user: authed } = await payload.auth({
      headers: new Headers({ Authorization: `users API-Key ${apiKey}` }),
    })
    expect(authed?.id).toBe(user.id)

    // A second save updates the existing membership instead of adding another row.
    await payload.update({ collection: 'users', id: user.id, data: { appRole: 'editor' } })
    expect(await appUsersRows(String(user.id))).toEqual([{ role: 'editor', status: 'active' }])

    await payload.delete({ collection: 'users', id: user.id })
  })

  it('writes the app role inside the save transaction', async () => {
    const user = await payload.create({
      collection: 'users',
      data: { email: `rollback-${Date.now()}@example.com`, password: 'password123' },
    })

    // Roll back a save that set a role. A write made on the transaction is undone with it;
    // one made on a separate connection would already be committed and survive.
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    await payload.update({ collection: 'users', id: user.id, data: { appRole: 'admin' }, req })
    await killTransaction(req)

    expect(await appUsersRows(String(user.id))).toEqual([])

    await payload.delete({ collection: 'users', id: user.id })
  })
})
