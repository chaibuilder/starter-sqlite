import { createHash } from 'node:crypto'

/**
 * Project-specific UUID v5 namespace. Fixed constant — do not change after
 * deploy (would change every app's R2 prefix). Not secret; obscures app UUID
 * in bucket paths when combined with v5(appKey).
 */
const MEDIA_STORAGE_NAMESPACE = 'a3f2c891-4e7b-5d2a-9c18-6f0e1b3d5a72'

function parseUuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '')
  if (hex.length !== 32) {
    throw new Error('Invalid namespace UUID')
  }
  return Buffer.from(hex, 'hex')
}

function formatUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** RFC 4122 UUID v5 — deterministic from namespace + name. */
function uuidV5(name: string, namespaceUuid: string): string {
  const namespace = parseUuidToBytes(namespaceUuid)
  const hash = createHash('sha1').update(namespace).update(name, 'utf8').digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x50 // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // variant RFC 4122
  return formatUuid(bytes)
}

/**
 * Opaque, deterministic R2 folder id for the current app.
 * UUID v5(CHAIBUILDER_APP_KEY) under a fixed project namespace.
 */
export function getAppStoragePrefix(appId?: string): string {
  const appKey = appId ?? process.env.CHAIBUILDER_APP_KEY
  if (!appKey) {
    throw new Error('CHAIBUILDER_APP_KEY is required to compute storage prefix')
  }
  return uuidV5(appKey, MEDIA_STORAGE_NAMESPACE)
}
