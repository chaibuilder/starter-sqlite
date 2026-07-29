import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getAppStoragePrefix } from '../../src/utilities/getAppStoragePrefix'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('getAppStoragePrefix', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    process.env.CHAIBUILDER_APP_KEY = '00000000-0000-4000-8000-000000000001'
  })

  afterEach(() => {
    process.env = env
  })

  it('returns a UUID-shaped string different from the app key', () => {
    const prefix = getAppStoragePrefix()
    expect(prefix).toMatch(UUID_RE)
    expect(prefix).not.toBe(process.env.CHAIBUILDER_APP_KEY)
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

  // Pin expected output so accidental namespace constant changes are caught
  it('matches pinned v5 output for a fixture app key', () => {
    expect(getAppStoragePrefix('00000000-0000-4000-8000-000000000001')).toBe(
      '56e6552e-e274-526d-85a9-c4107865b7ca',
    )
  })
})
