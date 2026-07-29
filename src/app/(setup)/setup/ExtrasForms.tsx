'use client'

import { useState } from 'react'
import { envBlock, envLine } from '../lib/env-lines'
import { CopyButton } from './CopyButton'

/** The only two AI providers setup offers. Both need a single key, nothing else. */
type AiProvider = 'gateway' | 'openrouter'

/**
 * Optional settings, offered after the site is running rather than during setup.
 *
 * Nothing is saved: each form formats the environment variables to paste into the
 * host, exactly like the wizard's final screen. One more redeploy applies them.
 */
export function ExtrasForms({ media, ai }: { media: boolean; ai: boolean }) {
  if (!media && !ai) return null

  return (
    <>
      {media && <MediaForm />}
      {ai && <AiForm />}
    </>
  )
}

function RedeployNote() {
  return (
    <p className="field-hint">
      Add these to your host&rsquo;s environment variables (Vercel: <strong>Settings</strong> →{' '}
      <strong>Environment Variables</strong>) and redeploy.
    </p>
  )
}

function MediaForm() {
  const [bucket, setBucket] = useState('')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [region, setRegion] = useState('')

  // A partial bucket config silently produces a site whose uploads do not
  // persist, so the block only appears once all three required values are in.
  const ready = Boolean(bucket.trim() && accessKeyId.trim() && secretAccessKey.trim())
  const block = envBlock([
    envLine('BUCKET_NAME', bucket),
    envLine('AWS_ACCESS_KEY_ID', accessKeyId),
    envLine('AWS_SECRET_ACCESS_KEY', secretAccessKey),
    ...(region.trim() ? [envLine('S3_REGION', region)] : []),
    ...(endpoint.trim() ? [envLine('S3_ENDPOINT', endpoint)] : []),
  ])

  return (
    <details className="card">
      <summary>Configure media storage</summary>
      <p className="hint">
        Works with any S3-compatible storage — Amazon S3, Cloudflare R2, Backblaze B2, MinIO. Create
        a bucket, then create access keys for it with read and write permission.
      </p>

      <div className="field-grid">
        <div>
          <label htmlFor="bucket">Bucket name</label>
          <input
            id="bucket"
            type="text"
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            placeholder="my-site-media"
          />
        </div>
        <div>
          <label htmlFor="accessKeyId">Access key ID</label>
          <input
            id="accessKeyId"
            type="text"
            value={accessKeyId}
            onChange={(e) => setAccessKeyId(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="secretAccessKey">Secret access key</label>
          <input
            id="secretAccessKey"
            type="password"
            value={secretAccessKey}
            onChange={(e) => setSecretAccessKey(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="s3Region">Region</label>
          <input
            id="s3Region"
            type="text"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="auto"
          />
        </div>
        <div className="span-2">
          <label htmlFor="s3Endpoint">Endpoint</label>
          <div className="field-hint">
            Required for Cloudflare R2 and similar. Leave empty for Amazon S3.
          </div>
          <input
            id="s3Endpoint"
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://<account-id>.r2.cloudflarestorage.com"
          />
        </div>
      </div>

      {ready ? (
        <>
          <pre className="env-block">
            <code>{block}</code>
          </pre>
          <div className="actions">
            <CopyButton value={block} label="Copy settings" copiedLabel="✓ Copied" />
          </div>
          <RedeployNote />
        </>
      ) : (
        <p className="field-hint">
          Fill in the bucket name, access key ID and secret access key to generate your settings.
        </p>
      )}
    </details>
  )
}

function AiForm() {
  const [provider, setProvider] = useState<AiProvider>('gateway')
  const [key, setKey] = useState('')

  const block = envBlock([
    provider === 'gateway'
      ? envLine('AI_GATEWAY_API_KEY', key)
      : envLine('OPENROUTER_API_KEY', key),
  ])

  return (
    <details className="card">
      <summary>Configure AI</summary>
      <p className="hint">Add a provider key to write and edit content with AI.</p>

      <fieldset className="provider-choice">
        <legend>Provider</legend>
        <label>
          <input
            type="radio"
            name="aiProvider"
            checked={provider === 'gateway'}
            onChange={() => setProvider('gateway')}
          />
          <span>
            <strong>Vercel AI Gateway</strong> — create a key under AI Gateway in your Vercel
            dashboard.
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="aiProvider"
            checked={provider === 'openrouter'}
            onChange={() => setProvider('openrouter')}
          />
          <span>
            <strong>
              <a href="https://openrouter.ai">OpenRouter</a>
            </strong>{' '}
            — create a key at openrouter.ai.
          </span>
        </label>
      </fieldset>

      <label htmlFor="aiKey">API key</label>
      <input
        id="aiKey"
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={provider === 'gateway' ? 'vck_...' : 'sk-or-...'}
      />

      {key.trim() ? (
        <>
          <pre className="env-block">
            <code>{block}</code>
          </pre>
          <div className="actions">
            <CopyButton value={block} label="Copy settings" copiedLabel="✓ Copied" />
          </div>
          <RedeployNote />
        </>
      ) : (
        <p className="field-hint">Paste your key to generate the setting.</p>
      )}
    </details>
  )
}
