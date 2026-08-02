/**
 * Number of hex characters kept from the app key. A UUID is 32 hex characters
 * in five groups; dropping the final 12-character group and the hyphens leaves
 * a 20-character token — 80 bits, far more than enough to keep app folders from
 * colliding, while the app key is never published in full.
 */
const PREFIX_LENGTH = 20

/**
 * Opaque, deterministic R2 folder id for the current app.
 *
 * The app key with its hyphens removed, truncated to the first
 * {@link PREFIX_LENGTH} hex characters. Deliberately a pure function of the app
 * key and nothing else: an app's folder is fixed for the life of the app, and
 * there is no constant here that anyone can change to send new uploads to a
 * second folder while old files stay behind in the first.
 *
 * The dropped group keeps the whole app key out of object paths — those 48 bits
 * cannot be recovered from the prefix.
 */
export function getAppStoragePrefix(appId?: string): string {
  const appKey = appId ?? process.env.CHAIBUILDER_APP_KEY
  if (!appKey) {
    throw new Error('CHAIBUILDER_APP_KEY is required to compute storage prefix')
  }
  const hex = appKey.replace(/-/g, '').toLowerCase()
  // `/setup` always writes a `randomUUID()`. Anything else is a hand-edited key,
  // and truncating it would put files at the bucket root or under a prefix
  // short enough to collide with another app — fail loudly instead.
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error('CHAIBUILDER_APP_KEY must be a UUID to compute storage prefix')
  }
  return hex.slice(0, PREFIX_LENGTH)
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
