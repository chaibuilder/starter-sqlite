import { createHash } from 'node:crypto'

/**
 * Project-specific UUID v5 namespace. Fixed constant — do not change after
 * deploy (would change every app's R2 prefix, orphaning already-uploaded
 * files). Not secret; obscures app UUID in bucket paths when combined with
 * v5(appKey).
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
 * Number of hex characters kept from the derived UUID. A UUID is 32 hex
 * characters in five groups; dropping the final 12-character group and the
 * hyphens leaves a 20-character token — 80 bits, far more than enough to keep
 * app folders from colliding, while nothing in the path still reads as a UUID.
 */
const PREFIX_LENGTH = 20

/**
 * Opaque, deterministic R2 folder id for the current app.
 *
 * UUID v5(CHAIBUILDER_APP_KEY) under a fixed project namespace, then stripped
 * of hyphens and truncated. Storage prefixes appear in object paths, so the
 * value is doubly removed from the app key: the v5 hash is not reversible, and
 * the truncation means the derived UUID is not published in full either.
 */
export function getAppStoragePrefix(appId?: string): string {
  const appKey = appId ?? process.env.CHAIBUILDER_APP_KEY
  if (!appKey) {
    throw new Error('CHAIBUILDER_APP_KEY is required to compute storage prefix')
  }
  return uuidV5(appKey, MEDIA_STORAGE_NAMESPACE).replace(/-/g, '').slice(0, PREFIX_LENGTH)
}

/**
 * The prefix media files are actually stored under, or `''` when uploads go to
 * local disk. Bucket credentials and the app key are both required: without
 * either one, `s3Storage` is not registered and nothing is prefixed.
 *
 * Resolved per call rather than at module load so it stays a runtime value —
 * baking it into the database schema as a column default would make the schema
 * differ between deployments and between build and run.
 */
export function getMediaStoragePrefix(): string {
  const configured =
    process.env.BUCKET_NAME &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.CHAIBUILDER_APP_KEY
  return configured ? getAppStoragePrefix() : ''
}
