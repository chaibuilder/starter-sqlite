// Any setup scripts you might need go here

// Load .env files
import 'dotenv/config'
import { TEST_DATABASE_URL } from './tests/helpers/postgres'

// Integration tests must never write to the real (remote) DATABASE_URL from
// .env. Point Payload at a disposable local Postgres database with schema push
// on so tables are created on the fresh schema (wiped per run in
// vitest.globalSetup).
process.env.DATABASE_URL = TEST_DATABASE_URL
process.env.PAYLOAD_DB_PUSH = 'true'
