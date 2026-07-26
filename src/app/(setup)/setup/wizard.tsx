'use client'

import { useEffect, useRef, useState } from 'react'
import { runSetup, testConnection } from './actions'

type Progress = 'idle' | 'migrating' | 'creating-admin' | 'creating-app' | 'done'

const PROGRESS_LABELS: { key: Exclude<Progress, 'idle' | 'done'>; label: string }[] = [
  { key: 'migrating', label: 'Preparing your database' },
  { key: 'creating-admin', label: 'Creating your admin account' },
  { key: 'creating-app', label: 'Creating your site' },
]

type StepId = 'name' | 'database' | 'admin' | 'extras' | 'review'

const ALL_STEPS: { id: StepId; title: string; optional: boolean }[] = [
  { id: 'name', title: 'Site name', optional: false },
  { id: 'database', title: 'Database', optional: false },
  { id: 'admin', title: 'Admin account', optional: false },
  { id: 'extras', title: 'Storage & AI', optional: true },
  { id: 'review', title: 'Review', optional: false },
]

const CLI_COMMAND = 'npx chaibuilder-app create'

/**
 * Database credentials already present on this deployment, probed server-side.
 * The auth token deliberately never crosses to the client — when the state is
 * `ready`, setup runs against the environment credentials on the server.
 */
export type EnvDatabase =
  | { state: 'absent' }
  | { state: 'ready'; url: string }
  | { state: 'broken'; url: string; error: string }

/**
 * Optional services already configured on the deployment. Presence only: there
 * is no cheap check that proves a bucket or an AI key works, so these are
 * reported as "already set", never as verified.
 */
export type EnvExtras = { media: boolean; ai: boolean }

/**
 * The two AI providers ChaiBuilder reads keys for. Vercel's AI Gateway is an
 * OpenAI-compatible endpoint, so it goes through the second one.
 */
type AiProvider = 'openrouter' | 'compatible'

/** 64 hex characters, the same shape the CLI generates for PAYLOAD_SECRET. */
function generateSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function envLine(key: string, value: string): string {
  return `${key}=${value}`
}

export function SetupWizard({
  envDatabase,
  envExtras,
}: {
  envDatabase: EnvDatabase
  envExtras: EnvExtras
}) {
  const [step, setStep] = useState(0)
  const [furthestStep, setFurthestStep] = useState(0)

  const [appName, setAppName] = useState('')
  // A broken env URL is worth prefilling so the user can correct it rather than
  // retype it; the token is not available here and stays blank.
  const [dbUrl, setDbUrl] = useState(envDatabase.state === 'broken' ? envDatabase.url : '')
  const [dbToken, setDbToken] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [bucket, setBucket] = useState('')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [s3Endpoint, setS3Endpoint] = useState('')
  const [s3Region, setS3Region] = useState('')
  const [aiProvider, setAiProvider] = useState<AiProvider>('openrouter')
  const [aiKey, setAiKey] = useState('')
  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [aiName, setAiName] = useState('')

  // Which database credentials `testConnection` has already approved, so Next
  // does not re-test unnecessarily but does re-test after an edit.
  const [verifiedDb, setVerifiedDb] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)

  const [progress, setProgress] = useState<Progress>('idle')
  const [percent, setPercent] = useState(0)
  const [appId, setAppId] = useState<string | null>(null)
  const [secret] = useState(generateSecret)
  const [copied, setCopied] = useState(false)

  const headingRef = useRef<HTMLHeadingElement>(null)
  const running = progress !== 'idle' && progress !== 'done'
  const mediaConfigured = Boolean(bucket.trim() && accessKeyId.trim() && secretAccessKey.trim())
  const dbKey = JSON.stringify([dbUrl.trim(), dbToken.trim()])

  // Working credentials on the deployment mean there is nothing to ask for. The
  // step stays in the rail, ticked, so it is clear it was handled rather than
  // silently dropped — but it is not one of the steps the wizard walks through.
  const useEnvDatabase = envDatabase.state === 'ready'
  // Nothing left to ask on the extras step when both services are already set.
  const extrasFromEnv = envExtras.media && envExtras.ai
  const steps = ALL_STEPS.filter(
    (s) => !(useEnvDatabase && s.id === 'database') && !(extrasFromEnv && s.id === 'extras'),
  )
  const stepIndex = Math.min(step, steps.length - 1)
  const current = steps[stepIndex]
  const isLast = stepIndex === steps.length - 1

  // Keyboard and screen-reader users would otherwise stay focused wherever the
  // previous step's button was. Skipped on first render, where there is no
  // previous step and the focus ring would just look like a stray outline.
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) headingRef.current?.focus()
    else mounted.current = true
  }, [step])

  function goTo(id: StepId) {
    const next = steps.findIndex((s) => s.id === id)
    if (next < 0) return
    setStepError(null)
    setStep(next)
    setFurthestStep((f) => Math.max(f, next))
  }

  function goToIndex(next: number) {
    setStepError(null)
    setStep(next)
    setFurthestStep((f) => Math.max(f, next))
  }

  /** Returns an error message, or null when the step may be left. */
  async function validateStep(): Promise<string | null> {
    switch (current.id) {
      case 'name':
        return appName.trim() ? null : 'Enter a name for your site.'
      case 'database': {
        if (!dbUrl.trim()) return 'Enter your database URL.'
        if (verifiedDb === dbKey) return null
        setChecking(true)
        const result = await testConnection({ url: dbUrl.trim(), authToken: dbToken.trim() })
        setChecking(false)
        if (!result.ok) return result.error
        setVerifiedDb(dbKey)
        return null
      }
      case 'admin':
        if (!email.trim()) return 'Enter an email address.'
        if (!email.includes('@')) return 'That does not look like an email address.'
        if (password.length < 4) return 'Password must be at least 4 characters.'
        if (password !== confirmPassword) return 'The two passwords do not match.'
        return null
      case 'extras': {
        // A partial bucket config silently produces a site whose uploads do not
        // persist, so require all three values together or none at all.
        const filled = [bucket, accessKeyId, secretAccessKey].filter((v) => v.trim()).length
        if (filled > 0 && filled < 3) {
          return 'Fill in the bucket name, access key ID and secret access key — or skip this step.'
        }
        // An OpenAI-compatible endpoint is useless without knowing where it is.
        if (aiProvider === 'compatible' && aiKey.trim() && !aiBaseUrl.trim()) {
          return 'Enter the API base URL for your OpenAI-compatible provider.'
        }
        return null
      }
      default:
        return null
    }
  }

  async function goNext(event?: React.FormEvent) {
    event?.preventDefault()
    const error = await validateStep()
    if (error) {
      setStepError(error)
      return
    }
    goToIndex(Math.min(stepIndex + 1, steps.length - 1))
  }

  function skipStep() {
    // Clearing the fields keeps the review summary and the generated settings
    // honest about what was skipped.
    if (current.id === 'extras') {
      setBucket('')
      setAccessKeyId('')
      setSecretAccessKey('')
      setS3Endpoint('')
      setS3Region('')
      setAiKey('')
      setAiBaseUrl('')
      setAiName('')
    }
    goToIndex(Math.min(stepIndex + 1, steps.length - 1))
  }

  async function handleCreate() {
    setStepError(null)

    // The action runs all three stages server-side without reporting back, so the
    // bar is an estimate: it eases towards 92% and only completes when the work
    // actually does. Creating the tables can take the better part of a minute and
    // a frozen button reads as a hang.
    setProgress('migrating')
    setPercent(0)
    const started = Date.now()
    const ticker = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000
      setPercent(Math.min(92, 92 * (1 - Math.exp(-elapsed / 18))))
    }, 200)
    const advance = [
      setTimeout(() => setProgress((p) => (p === 'migrating' ? 'creating-admin' : p)), 6000),
      setTimeout(() => setProgress((p) => (p === 'creating-admin' ? 'creating-app' : p)), 9000),
    ]

    const result = await runSetup({
      database: useEnvDatabase
        ? { source: 'env' }
        : { source: 'input', url: dbUrl.trim(), authToken: dbToken.trim() || undefined },
      appName: appName.trim(),
      email: email.trim(),
      password,
    })
    advance.forEach(clearTimeout)
    clearInterval(ticker)

    if (!result.ok) {
      setStepError(result.error)
      setProgress('idle')
      setPercent(0)
      return
    }

    setPercent(100)
    setAppId(result.data.appId)
    setProgress('done')
  }

  if (progress === 'done' && appId) {
    const siteUrl = typeof window === 'undefined' ? '' : window.location.origin
    const lines = [
      '# --- Required ---',
      // Already set on this deployment when the credentials came from the
      // environment; the auth token is not available here in any case.
      ...(useEnvDatabase
        ? []
        : [
            envLine('DATABASE_URL', dbUrl.trim()),
            ...(dbToken.trim() ? [envLine('DATABASE_AUTH_TOKEN', dbToken.trim())] : []),
          ]),
      envLine('PAYLOAD_SECRET', secret),
      envLine('CHAIBUILDER_APP_KEY', appId),
      envLine('NEXT_PUBLIC_SERVER_URL', siteUrl),
    ]
    if (mediaConfigured && !envExtras.media) {
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
    if (aiKey.trim() && !envExtras.ai) {
      lines.push(
        '',
        '# --- AI ---',
        ...(aiProvider === 'openrouter'
          ? [envLine('OPENROUTER_API_KEY', aiKey.trim())]
          : [
              envLine('OPENAI_COMPATIBLE_API_KEY', aiKey.trim()),
              envLine('OPENAI_COMPATIBLE_BASE_URL', aiBaseUrl.trim()),
              ...(aiName.trim() ? [envLine('OPENAI_COMPATIBLE_NAME', aiName.trim())] : []),
            ]),
      )
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
            {useEnvDatabase
              ? 'Your database settings are already on this deployment, so they are not repeated here — these are the ones still missing. '
              : ''}
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
          {!mediaConfigured && !envExtras.media && (
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
        This takes about five minutes. Nothing you type here is saved on this server.
      </p>

      <ol className="stepper">
        {ALL_STEPS.map((entry) => {
          if (
            (useEnvDatabase && entry.id === 'database') ||
            (extrasFromEnv && entry.id === 'extras')
          ) {
            return (
              <li key={entry.id} className="done satisfied">
                <span className="stepper-link">
                  <span className="stepper-num">✓</span>
                  <span className="stepper-title">{entry.title}</span>
                </span>
              </li>
            )
          }
          const index = steps.findIndex((s) => s.id === entry.id)
          const state = index === stepIndex ? 'current' : index < stepIndex ? 'done' : 'todo'
          const reachable = index <= furthestStep && !running
          return (
            <li
              key={entry.id}
              className={state}
              aria-current={index === stepIndex ? 'step' : undefined}
            >
              <button
                type="button"
                className="stepper-link"
                disabled={!reachable || index === stepIndex}
                onClick={() => goTo(entry.id)}
              >
                <span className="stepper-num">{state === 'done' ? '✓' : index + 1}</span>
                <span className="stepper-title">{entry.title}</span>
              </button>
            </li>
          )
        })}
      </ol>

      <form className="card" onSubmit={goNext} noValidate>
        <div className="step-head">
          <h2 ref={headingRef} tabIndex={-1}>
            {current.title}
          </h2>
          {current.optional && <span className="optional-tag">Optional</span>}
        </div>

        {current.id === 'name' && (
          <>
            <p className="hint">You can change this later.</p>
            <label htmlFor="appName">Site name</label>
            <input
              id="appName"
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="My Company"
              autoFocus
            />

            <aside className="cli-aside">
              <strong>Prefer the command line?</strong>
              <p>
                If you would rather run the project on your own machine first, this does the same
                setup — database, admin account and site — and writes a <code>.env</code> for you.
              </p>
              <div className="cli-command">
                <code>{CLI_COMMAND}</code>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    void navigator.clipboard.writeText(CLI_COMMAND).then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2500)
                    })
                  }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p>
                <a href="https://www.chaibuilder.com/docs">Read the setup guide</a>
              </p>
            </aside>
          </>
        )}

        {current.id === 'database' && (
          <>
            {envDatabase.state === 'broken' && (
              <div className="note warn">
                This deployment has database settings, but we could not use them: {envDatabase.error}{' '}
                Enter them again below.
              </div>
            )}
            <p className="hint">
              Your site stores its pages and content in a libSQL/SQLite database. That can be a
              hosted one such as <a href="https://turso.tech">Turso</a>, your own libSQL server, or
              a local file. Create the database, then copy its address here — hosted providers give
              you a <code>libsql://</code> URL, and a local file looks like{' '}
              <code>file:./payload.db</code>.
            </p>

            <label htmlFor="dbUrl">Database URL</label>
            <input
              id="dbUrl"
              type="text"
              value={dbUrl}
              onChange={(e) => setDbUrl(e.target.value)}
              placeholder="libsql://your-database.turso.io"
            />

            <label htmlFor="dbToken">Database token</label>
            <div className="field-hint">
              Hosted databases issue one and will refuse the connection without it. Leave empty only
              for a local <code>file:</code> database or a server with no authentication.
            </div>
            <input
              id="dbToken"
              type="password"
              value={dbToken}
              onChange={(e) => setDbToken(e.target.value)}
              placeholder="eyJhbGciOi..."
            />
            <p className="field-hint">We check the connection before moving on.</p>
          </>
        )}

        {current.id === 'admin' && (
          <>
            <p className="hint">This is how you will sign in to edit your site.</p>

            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />

            <label htmlFor="password">Password</label>
            <div className="field-hint">At least 4 characters.</div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </>
        )}

        {current.id === 'extras' && (
          <>
            <p className="hint">
              Both of these can be added later — skip if you do not have the details handy.
            </p>

            <h3>Media storage</h3>
            {envExtras.media ? (
              <p className="hint">Already set on this deployment — nothing to fill in here.</p>
            ) : (
              <>
                <p className="hint">
                  Recommended. Without this, images you upload are lost every time the site is
                  deployed, because hosts do not keep files written to disk. Works with any
                  S3-compatible storage — AWS S3, Cloudflare R2, Backblaze B2, MinIO and others.
                </p>
                <ol className="steps">
                  <li>Create a bucket with your storage provider.</li>
                  <li>Create access keys for it with read and write permission.</li>
                  <li>
                    Copy the key, the secret, and — for anything other than AWS — the S3 endpoint
                    URL.
                  </li>
                </ol>

            <label htmlFor="bucket">Bucket name</label>
            <input
              id="bucket"
              type="text"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              placeholder="my-site-media"
            />

            <label htmlFor="accessKeyId">Access key ID</label>
            <input
              id="accessKeyId"
              type="text"
              value={accessKeyId}
              onChange={(e) => setAccessKeyId(e.target.value)}
            />

            <label htmlFor="secretAccessKey">Secret access key</label>
            <input
              id="secretAccessKey"
              type="password"
              value={secretAccessKey}
              onChange={(e) => setSecretAccessKey(e.target.value)}
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
            />

            <label htmlFor="s3Region">Region</label>
            <div className="field-hint">Leave empty unless your provider gave you one.</div>
            <input
              id="s3Region"
              type="text"
              value={s3Region}
              onChange={(e) => setS3Region(e.target.value)}
              placeholder="auto"
            />

              </>
            )}

            <h3>AI features</h3>
            {envExtras.ai ? (
              <p className="hint">Already set on this deployment — nothing to fill in here.</p>
            ) : (
              <>
                <p className="hint">
                  Add a provider key to write and edit content with AI.
                </p>
                <fieldset className="provider-choice">
                  <legend>Provider</legend>
                  <label>
                    <input
                      type="radio"
                      name="aiProvider"
                      checked={aiProvider === 'openrouter'}
                      onChange={() => setAiProvider('openrouter')}
                    />
                    <span>
                      <a href="https://openrouter.ai">OpenRouter</a>
                    </span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="aiProvider"
                      checked={aiProvider === 'compatible'}
                      onChange={() => setAiProvider('compatible')}
                    />
                    <span>OpenAI-compatible endpoint — Vercel AI Gateway, OpenAI, or your own</span>
                  </label>
                </fieldset>

                <label htmlFor="aiKey">API key</label>
                <input
                  id="aiKey"
                  type="password"
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                  placeholder={aiProvider === 'openrouter' ? 'sk-or-...' : 'sk-...'}
                />

                {aiProvider === 'compatible' && (
                  <>
                    <label htmlFor="aiBaseUrl">API base URL</label>
                    <div className="field-hint">
                      For Vercel AI Gateway this is <code>https://ai-gateway.vercel.sh/v1</code>.
                    </div>
                    <input
                      id="aiBaseUrl"
                      type="text"
                      value={aiBaseUrl}
                      onChange={(e) => setAiBaseUrl(e.target.value)}
                      placeholder="https://ai-gateway.vercel.sh/v1"
                    />

                    <label htmlFor="aiName">Provider name</label>
                    <div className="field-hint">Optional. Shown in the editor.</div>
                    <input
                      id="aiName"
                      type="text"
                      value={aiName}
                      onChange={(e) => setAiName(e.target.value)}
                      placeholder="Vercel AI Gateway"
                    />
                  </>
                )}
              </>
            )}
          </>
        )}

        {current.id === 'review' && (
          <>
            <p className="hint">
              Check everything below, then we will create your database tables, your admin account,
              and your site.
            </p>
            <dl className="review-list">
              <ReviewRow label="Site name" value={appName.trim()} onEdit={() => goTo('name')} />
              {useEnvDatabase ? (
                <ReviewRow label="Database" value="Already configured on this deployment" />
              ) : (
                <ReviewRow label="Database" value={dbUrl.trim()} onEdit={() => goTo('database')} />
              )}
              <ReviewRow label="Admin email" value={email.trim()} onEdit={() => goTo('admin')} />
              {envExtras.media ? (
                <ReviewRow label="Media storage" value="Already set on this deployment" />
              ) : (
                <ReviewRow
                  label="Media storage"
                  value={mediaConfigured ? bucket.trim() : null}
                  onEdit={() => goTo('extras')}
                />
              )}
              {envExtras.ai ? (
                <ReviewRow label="AI" value="Already set on this deployment" />
              ) : (
                <ReviewRow
                  label="AI"
                  value={
                    aiKey.trim()
                      ? aiProvider === 'openrouter'
                        ? 'OpenRouter key added'
                        : 'OpenAI-compatible key added'
                      : null
                  }
                  onEdit={() => goTo('extras')}
                />
              )}
            </dl>
            {!mediaConfigured && !envExtras.media && (
              <div className="note warn">
                Without media storage, images you upload will not survive a redeploy. You can add it
                now or later.
              </div>
            )}
          </>
        )}

        {stepError && <div className="note error">{stepError}</div>}

        {running && (
          <div className="progress-bar" role="progressbar" aria-valuenow={Math.round(percent)}>
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
        )}

        {running && (
          <ul className="progress">
            {PROGRESS_LABELS.map((entry, index) => {
              const currentIndex = PROGRESS_LABELS.findIndex((e) => e.key === progress)
              const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : ''
              return (
                <li key={entry.key} className={state}>
                  {state === 'done' ? '✓ ' : state === 'active' ? '→ ' : '   '}
                  {entry.label}
                </li>
              )
            })}
          </ul>
        )}

        <div className="step-nav">
          {stepIndex > 0 && (
            <button
              type="button"
              className="secondary"
              onClick={() => goToIndex(stepIndex - 1)}
              disabled={running}
            >
              Back
            </button>
          )}
          <div className="step-nav-end">
            {current.optional && (
              <button type="button" className="secondary" onClick={skipStep} disabled={running}>
                Skip for now
              </button>
            )}
            {isLast ? (
              <button type="button" onClick={handleCreate} disabled={running}>
                {running ? 'Setting up…' : 'Create my site'}
              </button>
            ) : (
              <button type="submit" disabled={checking}>
                {checking ? 'Checking…' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </form>

      {running && (
        <p className="hint">
          Creating the database tables can take up to a minute. Please keep this page open.
        </p>
      )}
    </div>
  )
}

function ReviewRow({
  label,
  value,
  onEdit,
}: {
  label: string
  value: string | null
  onEdit?: () => void
}) {
  return (
    <div className="review-row">
      <dt>{label}</dt>
      <dd>
        {value ? <span>{value}</span> : <span className="muted-value">Skipped</span>}
        {onEdit && (
          <button type="button" className="link" onClick={onEdit}>
            Change
          </button>
        )}
      </dd>
    </div>
  )
}
