'use client'

import { envBlock, envLine } from '../lib/env-lines'
import { hasMedia, type Extras } from './ExtrasFields'
import { BrandHeader } from './BrandHeader'
import { CopyButton } from './CopyButton'

/** Which host this deployment is running on, detected server-side. */
export type Host = 'vercel' | 'netlify' | 'unknown'

const DOCS_URL = 'https://www.chaibuilder.com/docs'

/**
 * The one screen that matters after setup runs: the variables to copy, and the
 * single redeploy that applies them. Instructions are written for the host we
 * detected rather than making the user pick their own out of a list.
 */
export function SuccessScreen({
  appId,
  secret,
  useEnvDatabase,
  dbUrl,
  dbToken,
  extras,
  envMedia,
  envAi,
  host,
  hostEnvUrl,
}: {
  appId: string
  secret: string
  useEnvDatabase: boolean
  dbUrl: string
  dbToken: string
  extras: Extras
  envMedia: boolean
  envAi: boolean
  host: Host
  hostEnvUrl: string | null
}) {
  const siteUrl = typeof window === 'undefined' ? '' : window.location.origin
  const mediaAdded = hasMedia(extras) && !envMedia
  const aiAdded = Boolean(extras.aiKey.trim()) && !envAi

  const block = envBlock([
    // Already set on this deployment when the credentials came from the
    // environment; the auth token is not available here in any case.
    ...(useEnvDatabase
      ? []
      : [
          envLine('DATABASE_URL', dbUrl),
          ...(dbToken ? [envLine('DATABASE_AUTH_TOKEN', dbToken)] : []),
        ]),
    envLine('PAYLOAD_SECRET', secret),
    envLine('CHAIBUILDER_APP_KEY', appId),
    envLine('NEXT_PUBLIC_SERVER_URL', siteUrl),
    ...(mediaAdded
      ? [
          envLine('BUCKET_NAME', extras.bucket),
          envLine('AWS_ACCESS_KEY_ID', extras.accessKeyId),
          envLine('AWS_SECRET_ACCESS_KEY', extras.secretAccessKey),
          ...(extras.s3Region.trim() ? [envLine('S3_REGION', extras.s3Region)] : []),
          ...(extras.s3Endpoint.trim() ? [envLine('S3_ENDPOINT', extras.s3Endpoint)] : []),
        ]
      : []),
    ...(aiAdded
      ? [
          extras.aiProvider === 'gateway'
            ? envLine('AI_GATEWAY_API_KEY', extras.aiKey)
            : envLine('OPENROUTER_API_KEY', extras.aiKey),
        ]
      : []),
  ])

  return (
    <div className="wrap">
      <BrandHeader />
      <h1>Your site is ready — one last step</h1>
      <p className="lede">
        Add these environment variables to your host and redeploy once — that is the last step.
      </p>

      <div className="scroll-area">
        <div className="card">
          <h2>1. Copy your environment variables</h2>
          <p className="hint">
            {useEnvDatabase
              ? 'DATABASE_URL is already set on this deployment, so it is not repeated here. '
              : ''}
            This is the only time the password-like values are shown.
          </p>
          <pre className="env-block">
            <code>{block}</code>
          </pre>
          <div className="actions">
            <CopyButton
              value={block}
              label="Copy env variables"
              copiedLabel="✓ Copied to clipboard"
            />
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([block], { type: 'text/plain;charset=utf-8' }),
                )
                const a = document.createElement('a')
                a.href = url
                a.download = '.env'
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
              }}
            >
              Download as file
            </button>
          </div>
        </div>

        <div className="card">
          <h2>2. Paste them in and redeploy — once</h2>
          {host === 'netlify' ? (
            <ol className="steps">
              <li>
                {hostEnvUrl ? (
                  <>
                    Open <a href={hostEnvUrl}>this site&rsquo;s environment variables</a> on Netlify.
                  </>
                ) : (
                  <>
                    In the Netlify dashboard, open this site &rarr;{' '}
                    <strong>Site configuration</strong> &rarr;{' '}
                    <strong>Environment variables</strong>.
                  </>
                )}
              </li>
              <li>
                Choose <strong>Import from a .env file</strong> and paste the whole block.
              </li>
              <li>
                <strong>Deploys</strong> &rarr; <strong>Trigger deploy</strong>. Usually a minute or
                two.
              </li>
            </ol>
          ) : (
            <ol className="steps">
              <li>
                {hostEnvUrl ? (
                  <>
                    Open <a href={hostEnvUrl}>this project&rsquo;s environment variables</a> on
                    Vercel.
                  </>
                ) : (
                  <>
                    Open <a href="https://vercel.com/dashboard">vercel.com/dashboard</a>, click this
                    project, then <strong>Settings</strong> &rarr;{' '}
                    <strong>Environment Variables</strong>.
                  </>
                )}
              </li>
              <li>Paste the whole block and save. Vercel splits it into separate variables.</li>
              <li>
                <strong>Deployments</strong> &rarr; <strong>⋯</strong> on the latest one &rarr;{' '}
                <strong>Redeploy</strong>. Usually a minute or two.
              </li>
            </ol>
          )}
          <p>
            When it finishes, sign in at <code>/admin</code> with the email and password you just
            chose.
          </p>
        </div>

        <p className="hint">
          {!mediaAdded && !envMedia && (
            <>
              You skipped media storage, so uploaded images will not survive a redeploy —{' '}
              <a href={DOCS_URL}>the docs</a> cover adding it later.{' '}
            </>
          )}
          Setup disables itself once configured: safe to leave, or delete{' '}
          <code>src/app/(setup)</code> to remove it.
        </p>
      </div>
    </div>
  )
}
