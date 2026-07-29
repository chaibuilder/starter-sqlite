import { resetTestDatabase } from './tests/helpers/postgres'

// Integration tests run against a disposable local Postgres database (see
// vitest.setup.ts). Wipe it once per run so fixed-slug fixtures start clean
// and tests never touch the real DATABASE_URL from .env.
export default async function globalSetup() {
  await resetTestDatabase()
}
