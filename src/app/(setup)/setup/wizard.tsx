'use client'

import { useState } from 'react'
import { runSetup, testConnection } from './actions'

type Progress = 'idle' | 'migrating' | 'creating-admin' | 'creating-app' | 'done'

const STEP_LABELS: { key: Exclude<Progress, 'idle' | 'done'>; label: string }[] = [
  { key: 'migrating', label: 'Preparing your database' },
  { key: 'creating-admin', label: 'Creating your admin account' },
  { key: 'creating-app', label: 'Creating your site' },
]

/** 64 hex characters, the same shape the CLI generates for PAYLOAD_SECRET. */
function generateSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function envLine(key: string, value: string): string {
  return `${key}=${value}`
}

export function SetupWizard() {
  const [appName, setAppName] = useState('')
  const [dbUrl, setDbUrl] = useState('')
  const [dbToken, setDbToken] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [bucket, setBucket] = useState('')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [s3Endpoint, setS3Endpoint] = useState('')
  const [s3Region, setS3Region] = useState('')
  const [aiKey, setAiKey] = useState('')

  const [testState, setTestState] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [progress, setProgress] = useState<Progress>('idle')
  const [error, setError] = useState<string | null>(null)
  const [appId, setAppId] = useState<string | null>(null)
  const [secret] = useState(generateSecret)
  const [copied, setCopied] = useState(false)

  const running = progress !== 'idle' && progress !== 'done'

  async function handleTest() {
    setTesting(true)
    setTestState(null)
    const result = await testConnection({ url: dbUrl.trim(), authToken: dbToken.trim() })
    setTestState(
      result.ok
        ? { kind: 'ok', message: result.data.message }
        : { kind: 'error', message: result.error },
    )
    setTesting(false)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('The two passwords do not match.')
      return
    }

    // The action runs all three steps server-side; advance the labels on a timer
    // so the user sees which part is taking time rather than a frozen button.
    setProgress('migrating')
    const advance = [
      setTimeout(() => setProgress((p) => (p === 'migrating' ? 'creating-admin' : p)), 6000),
      setTimeout(() => setProgress((p) => (p === 'creating-admin' ? 'creating-app' : p)), 9000),
    ]

    const result = await runSetup({
      url: dbUrl.trim(),
      authToken: dbToken.trim() || undefined,
      appName: appName.trim(),
      email: email.trim(),
      password,
    })
    advance.forEach(clearTimeout)

    if (!result.ok) {
      setError(result.error)
      setProgress('idle')
      return
    }

    setAppId(result.data.appId)
    setProgress('done')
  }

  if (progress === 'done' && appId) {
    const siteUrl = typeof window === 'undefined' ? '' : window.location.origin
    const lines = [
      '# --- Required ---',
      envLine('DATABASE_URL', dbUrl.trim()),
      ...(dbToken.trim() ? [envLine('DATABASE_AUTH_TOKEN', dbToken.trim())] : []),
      envLine('PAYLOAD_SECRET', secret),
      envLine('CHAIBUILDER_APP_KEY', appId),
      envLine('NEXT_PUBLIC_SERVER_URL', siteUrl),
    ]
    if (bucket.trim() && accessKeyId.trim() && secretAccessKey.trim()) {
      lines.push(
        '',
        '# --- Media storage ---',
        envLine('BUCKET_NAME', bucket.trim()),
        envLine('AWS_ACCESS_KEY_ID', accessKeyId.trim()),
        envLine('AWS_SECRET_ACCESS_KEY', secretAccessKey.trim()),
        ...(s3Region.trim() ? [envLine('S3_REGION', s3Region.trim())] : []),
        ...(s3Endpoint.trim() ? [envLine('S3_ENDPOINT', s3Endpoint.trim())] : []),
      )
    }
    if (aiKey.trim()) {
      lines.push('', '# --- AI ---', envLine('OPENROUTER_API_KEY', aiKey.trim()))
    }
    const envBlock = lines.join('\n')

    return (
      <div className="wrap">
        <div className="brand">ChaiBuilder</div>
        <h1>Your site is ready — one last step</h1>
        <p className="lede">
          We created your database tables, your admin account, and your site. To finish, your
          hosting provider needs the settings below.
        </p>

        <div className="card">
          <h2>1. Copy your settings</h2>
          <p className="hint">
            This is the only time the password-like values are shown. Keep them somewhere safe until
            you have finished step 2.
          </p>
          <pre>
            <code>{envBlock}</code>
          </pre>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(envBlock).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2500)
              })
            }}
          >
            {copied ? 'Copied' : 'Copy all settings'}
          </button>
        </div>

        <div className="card">
          <h2>2. Paste them into Vercel</h2>
          <ol className="steps">
            <li>
              Open <a href="https://vercel.com/dashboard">vercel.com/dashboard</a> and click this
              project.
            </li>
            <li>
              Go to <strong>Settings</strong> → <strong>Environment Variables</strong>.
            </li>
            <li>
              Click the field, paste everything you copied, and save. Vercel splits the block into
              separate variables automatically.
            </li>
          </ol>
          <p className="hint">
            On Netlify the equivalent is <strong>Site configuration</strong> →{' '}
            <strong>Environment variables</strong> → <strong>Import from a .env file</strong>.
          </p>
        </div>

        <div className="card">
          <h2>3. Deploy again</h2>
          <ol className="steps">
            <li>
              Open the <strong>Deployments</strong> tab.
            </li>
            <li>
              On the most recent deployment, open the <strong>⋯</strong> menu and choose{' '}
              <strong>Redeploy</strong>.
            </li>
            <li>Wait for it to finish — usually a minute or two.</li>
          </ol>
          <p>
            When it is done, sign in at <code>/admin</code> with the email and password you just
            chose.
          </p>
          {!bucket.trim() && (
            <div className="note warn">
              You skipped media storage. Images you upload will disappear the next time the site is
              deployed. You can add those settings later and redeploy.
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="wrap">
      <div className="brand">ChaiBuilder</div>
      <h1>Let&rsquo;s set up your site</h1>
      <p className="lede">
        This takes about five minutes. You will need a free database, and we will walk you through
        creating one. Nothing you type here is saved on this server.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="step-head">
            <span className="step-num">1</span>
            <h2>Name your site</h2>
          </div>
          <p className="hint">You can change this later.</p>
          <label htmlFor="appName">Site name</label>
          <input
            id="appName"
            type="text"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="My Company"
            required
            disabled={running}
          />
        </div>

        <div className="card">
          <div className="step-head">
            <span className="step-num">2</span>
            <h2>Connect a database</h2>
          </div>
          <p className="hint">
            Your site stores its pages and content in a database. Turso offers a free one that works
            well here.
          </p>
          <ol className="steps">
            <li>
              Create a free account at <a href="https://turso.tech">turso.tech</a>.
            </li>
            <li>Create a database — any name is fine.</li>
            <li>
              Open the database and copy its <strong>URL</strong>. It starts with{' '}
              <code>libsql://</code>.
            </li>
            <li>
              In the same place, create a <strong>token</strong> and copy it. It is a long string of
              letters and numbers.
            </li>
          </ol>

          <label htmlFor="dbUrl">Database URL</label>
          <input
            id="dbUrl"
            type="text"
            value={dbUrl}
            onChange={(e) => {
              setDbUrl(e.target.value)
              setTestState(null)
            }}
            placeholder="libsql://your-database.turso.io"
            required
            disabled={running}
          />

          <label htmlFor="dbToken">Database token</label>
          <div className="field-hint">Leave empty only if your database has no token.</div>
          <input
            id="dbToken"
            type="password"
            value={dbToken}
            onChange={(e) => {
              setDbToken(e.target.value)
              setTestState(null)
            }}
            placeholder="eyJhbGciOi..."
            disabled={running}
          />

          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={handleTest}
              disabled={testing || running || !dbUrl.trim()}
            >
              {testing ? 'Checking…' : 'Test connection'}
            </button>
          </div>
          {testState && (
            <div className={`note ${testState.kind}`}>{testState.message}</div>
          )}
        </div>

        <div className="card">
          <div className="step-head">
            <span className="step-num">3</span>
            <h2>Create your admin account</h2>
          </div>
          <p className="hint">This is how you will sign in to edit your site.</p>

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            disabled={running}
          />

          <label htmlFor="password">Password</label>
          <div className="field-hint">At least 4 characters.</div>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={4}
            required
            disabled={running}
          />

          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={4}
            required
            disabled={running}
          />
        </div>

        <div className="card">
          <div className="step-head">
            <span className="step-num">4</span>
            <h2>Media storage</h2>
          </div>
          <p className="hint">
            Recommended. Without this, images you upload are lost every time the site is deployed,
            because hosts like Vercel do not keep uploaded files. Cloudflare R2 has a free tier.
          </p>
          <ol className="steps">
            <li>
              In the <a href="https://dash.cloudflare.com">Cloudflare dashboard</a>, open{' '}
              <strong>R2</strong> and create a bucket.
            </li>
            <li>
              Create an <strong>API token</strong> for the bucket with read and write access.
            </li>
            <li>
              Copy the access key, the secret key, and the S3 endpoint shown on the token screen.
            </li>
          </ol>

          <label htmlFor="bucket">Bucket name</label>
          <input
            id="bucket"
            type="text"
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            placeholder="my-site-media"
            disabled={running}
          />

          <label htmlFor="accessKeyId">Access key ID</label>
          <input
            id="accessKeyId"
            type="text"
            value={accessKeyId}
            onChange={(e) => setAccessKeyId(e.target.value)}
            disabled={running}
          />

          <label htmlFor="secretAccessKey">Secret access key</label>
          <input
            id="secretAccessKey"
            type="password"
            value={secretAccessKey}
            onChange={(e) => setSecretAccessKey(e.target.value)}
            disabled={running}
          />

          <label htmlFor="s3Endpoint">Endpoint</label>
          <div className="field-hint">
            Required for Cloudflare R2 and similar services. Leave empty for Amazon S3.
          </div>
          <input
            id="s3Endpoint"
            type="text"
            value={s3Endpoint}
            onChange={(e) => setS3Endpoint(e.target.value)}
            placeholder="https://<account-id>.r2.cloudflarestorage.com"
            disabled={running}
          />

          <label htmlFor="s3Region">Region</label>
          <div className="field-hint">Leave empty unless your provider gave you one.</div>
          <input
            id="s3Region"
            type="text"
            value={s3Region}
            onChange={(e) => setS3Region(e.target.value)}
            placeholder="auto"
            disabled={running}
          />
        </div>

        <div className="card">
          <div className="step-head">
            <span className="step-num">5</span>
            <h2>AI features</h2>
          </div>
          <p className="hint">
            Optional. Add a key from <a href="https://openrouter.ai">OpenRouter</a> to write and
            edit content with AI. You can add this later.
          </p>
          <label htmlFor="aiKey">OpenRouter API key</label>
          <input
            id="aiKey"
            type="password"
            value={aiKey}
            onChange={(e) => setAiKey(e.target.value)}
            placeholder="sk-or-..."
            disabled={running}
          />
        </div>

        {error && <div className="note error">{error}</div>}

        {running && (
          <div className="card">
            <h2>Setting things up…</h2>
            <ul className="progress">
              {STEP_LABELS.map((step, index) => {
                const currentIndex = STEP_LABELS.findIndex((s) => s.key === progress)
                const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : ''
                return (
                  <li key={step.key} className={state}>
                    {state === 'done' ? '✓ ' : state === 'active' ? '→ ' : '   '}
                    {step.label}
                  </li>
                )
              })}
            </ul>
            <p className="hint">
              Creating the database tables can take up to a minute. Please keep this page open.
            </p>
          </div>
        )}

        <div className="actions">
          <button type="submit" disabled={running}>
            {running ? 'Setting up…' : 'Create my site'}
          </button>
        </div>
      </form>
    </div>
  )
}
