'use client'

import { useState } from 'react'
import { envBlock, envLine } from '../lib/env-lines'
import { BrandHeader } from './BrandHeader'
import { CopyButton } from './CopyButton'

type Host = 'vercel' | 'netlify'

/**
 * The one screen that matters after setup runs: the settings to copy, and the
 * single redeploy that applies them. Media and AI are deliberately absent —
 * they are optional, and `/setup` offers forms for them once the site is up.
 */
export function SuccessScreen({
  appId,
  secret,
  useEnvDatabase,
  dbUrl,
  dbToken,
  envMedia,
}: {
  appId: string
  secret: string
  useEnvDatabase: boolean
  dbUrl: string
  dbToken: string
  envMedia: boolean
}) {
  const [host, setHost] = useState<Host>('vercel')

  const siteUrl = typeof window === 'undefined' ? '' : window.location.origin
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
  ])

  return (
    <div className="wrap">
      <BrandHeader />
      <h1>Your site is ready — one last step</h1>
      <p className="lede">
        Add these settings to your host and redeploy once. You will not have to do this again.
      </p>

      <div className="scroll-area">
        <div className="card">
          <h2>1. Copy your settings</h2>
          <p className="hint">
            {useEnvDatabase
              ? 'Your database settings are already on this deployment, so they are not repeated here. '
              : ''}
            This is the only time the password-like values are shown.
          </p>
          <pre className="env-block">
            <code>{block}</code>
          </pre>
          <div className="actions">
            <CopyButton value={block} label="Copy settings" copiedLabel="✓ Copied to clipboard" />
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
              Download .env
            </button>
          </div>
        </div>

        <div className="card">
          <h2>2. Paste them in and redeploy — once</h2>
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className="tab"
              aria-selected={host === 'vercel'}
              onClick={() => setHost('vercel')}
            >
              Vercel
            </button>
            <button
              type="button"
              role="tab"
              className="tab"
              aria-selected={host === 'netlify'}
              onClick={() => setHost('netlify')}
            >
              Netlify
            </button>
          </div>

          {host === 'vercel' ? (
            <ol className="steps">
              <li>
                Open <a href="https://vercel.com/dashboard">vercel.com/dashboard</a> and click this
                project.
              </li>
              <li>
                <strong>Settings</strong> → <strong>Environment Variables</strong> → paste the whole
                block and save. Vercel splits it into separate variables.
              </li>
              <li>
                <strong>Deployments</strong> → <strong>⋯</strong> on the latest one →{' '}
                <strong>Redeploy</strong>. Usually a minute or two.
              </li>
            </ol>
          ) : (
            <ol className="steps">
              <li>Open your site in the Netlify dashboard.</li>
              <li>
                <strong>Site configuration</strong> → <strong>Environment variables</strong> →{' '}
                <strong>Import from a .env file</strong> → paste the block.
              </li>
              <li>
                <strong>Deploys</strong> → <strong>Trigger deploy</strong>. Usually a minute or two.
              </li>
            </ol>
          )}
          <p>
            When it finishes, sign in at <code>/admin</code> with the email and password you just
            chose.
          </p>
        </div>

        <p className="hint">
          {!envMedia && (
            <>
              Media storage and AI are optional — open <code>/setup</code> again after redeploying
              to add them.{' '}
            </>
          )}
          Setup disables itself once configured, so it is safe to leave in place; to remove it,
          delete <code>src/app/(setup)</code>.
        </p>
      </div>
    </div>
  )
}
