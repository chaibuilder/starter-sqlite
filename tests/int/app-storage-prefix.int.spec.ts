import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getAppStoragePrefix, getMediaStoragePrefix } from '../../src/utilities/getAppStoragePrefix'

const PREFIX_RE = /^[0-9a-f]{20}$/

describe('getAppStoragePrefix', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    process.env.CHAIBUILDER_APP_KEY = '00000000-0000-4000-8000-000000000001'
  })

  afterEach(() => {
    process.env = env
  })

  // The prefix shows up in object paths, so it must not read as a UUID: no
  // hyphens, and short enough that no complete UUID is published.
  it('returns 20 hex characters with no hyphens', () => {
    const prefix = getAppStoragePrefix()
    expect(prefix).toMatch(PREFIX_RE)
    expect(prefix).not.toContain('-')
  })

  it('leaks neither the app key nor the full derived UUID', () => {
    const appKey = process.env.CHAIBUILDER_APP_KEY!
    const prefix = getAppStoragePrefix()
    expect(prefix).not.toBe(appKey)
    expect(prefix).not.toContain(appKey.replace(/-/g, ''))
    // 20 of the derived UUID's 32 hex characters — the last group is dropped.
    expect(prefix).toHaveLength(20)
  })

  it('is stable for the same app key', () => {
    expect(getAppStoragePrefix()).toBe(getAppStoragePrefix())
  })

  it('changes when app key changes', () => {
    const a = getAppStoragePrefix()
    process.env.CHAIBUILDER_APP_KEY = '00000000-0000-4000-8000-000000000002'
    const b = getAppStoragePrefix()
    expect(a).not.toBe(b)
  })

  it('is unaffected by PAYLOAD_SECRET', () => {
    const before = getAppStoragePrefix()
    process.env.PAYLOAD_SECRET = 'totally-different-secret'
    expect(getAppStoragePrefix()).toBe(before)
  })

  it('accepts explicit appId override', () => {
    const fromEnv = getAppStoragePrefix()
    const fromArg = getAppStoragePrefix('00000000-0000-4000-8000-000000000001')
    expect(fromArg).toBe(fromEnv)
  })

  it('throws when CHAIBUILDER_APP_KEY missing', () => {
    delete process.env.CHAIBUILDER_APP_KEY
    expect(() => getAppStoragePrefix()).toThrow(/CHAIBUILDER_APP_KEY/)
  })

  // Pin expected output so accidental namespace or truncation changes are
  // caught — either would orphan every file already in the bucket.
  it('matches pinned output for a fixture app key', () => {
    expect(getAppStoragePrefix('00000000-0000-4000-8000-000000000001')).toBe(
      '56e6552ee274526d85a9',
    )
  })
})

describe('getMediaStoragePrefix', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    process.env.CHAIBUILDER_APP_KEY = '00000000-0000-4000-8000-000000000001'
    process.env.BUCKET_NAME = 'media'
    process.env.AWS_ACCESS_KEY_ID = 'key'
    process.env.AWS_SECRET_ACCESS_KEY = 'secret'
  })

  afterEach(() => {
    process.env = env
  })

  it('returns the app storage prefix when the bucket is fully configured', () => {
    expect(getMediaStoragePrefix()).toBe(getAppStoragePrefix())
  })

  // Each of these leaves `s3Storage` unregistered, so uploads go to local disk
  // and carry no prefix. Throwing instead would break booting an unconfigured
  // deployment far enough to serve `/setup`.
  it.each(['BUCKET_NAME', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'CHAIBUILDER_APP_KEY'])(
    'returns an empty prefix when %s is missing',
    (missing) => {
      delete process.env[missing]
      expect(getMediaStoragePrefix()).toBe('')
    },
  )
})
