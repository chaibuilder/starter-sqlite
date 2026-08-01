'use client'

import { useEffect, useRef, useState } from 'react'
import { runSetup, testConnection } from './actions'
import { BrandHeader } from './BrandHeader'
import { EMPTY_EXTRAS, ExtrasFields, mediaPartlyFilled, type Extras } from './ExtrasFields'
import { NewTabLink } from './NewTabLink'
import { SuccessScreen, type Host } from './SuccessScreen'

type Progress =
  | 'idle'
  | 'checking'
  | 'preparing'
  | 'setting-up'
  | 'creating-admin'
  | 'creating-site'
  | 'adding-homepage'
  | 'finalizing'
  | 'done'

const PROGRESS_LABELS: { key: Exclude<Progress, 'idle' | 'done'>; label: string }[] = [
  { key: 'checking', label: 'Checking database' },
  { key: 'preparing', label: 'Preparing database' },
  { key: 'setting-up', label: 'Setting up database' },
  { key: 'creating-admin', label: 'Creating admin user' },
  { key: 'creating-site', label: 'Creating your site' },
  { key: 'adding-homepage', label: 'Adding homepage' },
  { key: 'finalizing', label: 'Finalizing' },
]

type StepId = 'site' | 'database' | 'review'

/**
 * Three steps, deliberately. The two required ones ask only for what setup
 * cannot proceed without; storage and AI are optional and sit collapsed on the
 * last step, so whatever the user does fill in ships in the same block of
 * variables — one paste, one redeploy, whichever they choose.
 */
const ALL_STEPS: { id: StepId; title: string; description: string }[] = [
  { id: 'site', title: 'Your site', description: 'Name and admin login' },
  { id: 'database', title: 'Database', description: 'Database connection' },
  { id: 'review', title: 'Create', description: 'Review and launch' },
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

/** 64 hex characters, the same shape the CLI generates for PAYLOAD_SECRET. */
function generateSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function SetupWizard({
  envDatabase,
  envMedia,
  envAi,
  host,
  hostEnvUrl,
}: {
  envDatabase: EnvDatabase
  envMedia: boolean
  envAi: boolean
  host: Host
  hostEnvUrl: string | null
}) {
  const [step, setStep] = useState(0)
  const [furthestStep, setFurthestStep] = useState(0)

  const [appName, setAppName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // A broken env URL is worth prefilling so the user can correct it rather than
  // retype it; the token is not available here and stays blank.
  const [dbUrl, setDbUrl] = useState(envDatabase.state === 'broken' ? envDatabase.url : '')
  const [dbToken, setDbToken] = useState('')
  const [extras, setExtras] = useState<Extras>(EMPTY_EXTRAS)

  // Which database credentials `testConnection` has already approved, so Next
  // does not re-test unnecessarily but does re-test after an edit.
  const [verifiedDb, setVerifiedDb] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)

  const [progress, setProgress] = useState<Progress>('idle')
  const [percent, setPercent] = useState(0)
  const [appId, setAppId] = useState<string | null>(null)
  const [secret] = useState(generateSecret)

  const headingRef = useRef<HTMLHeadingElement>(null)
  const running = progress !== 'idle' && progress !== 'done'
  const dbKey = JSON.stringify([dbUrl.trim(), dbToken.trim()])

  // The same wizard serves a deployment and a checkout on the user's own
  // machine. Only the last step really differs — a `.env` file and a restart
  // instead of a dashboard and a redeploy — but the promise made up front has to
  // match it, so the wording follows the host from the first screen.
  const isLocal = host === 'local'

  // Working credentials on the deployment mean there is nothing to ask for. The
  // step stays in the rail, ticked, so it is clear it was handled rather than
  // silently dropped — but it is not one of the steps the wizard walks through.
  const useEnvDatabase = envDatabase.state === 'ready'
  const steps = ALL_STEPS.filter((s) => !(useEnvDatabase && s.id === 'database'))
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
      case 'site':
        if (!appName.trim()) return 'Enter a name for your site.'
        if (!email.trim()) return 'Enter an email address.'
        if (!email.includes('@')) return 'That does not look like an email address.'
        if (password.length < 4) return 'Password must be at least 4 characters.'
        return null
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

    setStepError(null)
    const next = stepIndex + 1
    if (next >= steps.length) return
    setStep(next)
    setFurthestStep((f) => Math.max(f, next))
  }

  async function handleCreate() {
    // A partial bucket config would ship variables that silently do not work, so
    // it is the one optional thing worth blocking on.
    if (mediaPartlyFilled(extras)) {
      setStepError(
        'Media storage needs the bucket name, access key ID and secret access key together — fill in all three, or clear them to skip.',
      )
      return
    }
    setStepError(null)

    // The action runs all three stages server-side without reporting back, so the
    // bar is an estimate: it eases towards 92% and only completes when the work
    // actually does. Creating the tables can take the better part of a minute and
    // a frozen button reads as a hang.
    setProgress('checking')
    setPercent(0)
    const started = Date.now()
    const ticker = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000
      setPercent(Math.min(92, 92 * (1 - Math.exp(-elapsed / 18))))
    }, 200)
    const advance = [
      setTimeout(() => setProgress((p) => (p === 'checking' ? 'preparing' : p)), 400),
      setTimeout(() => setProgress((p) => (p === 'preparing' ? 'setting-up' : p)), 600),
      setTimeout(() => setProgress((p) => (p === 'setting-up' ? 'creating-admin' : p)), 800),
      setTimeout(() => setProgress((p) => (p === 'creating-admin' ? 'creating-site' : p)), 1000),
      setTimeout(() => setProgress((p) => (p === 'creating-site' ? 'adding-homepage' : p)), 1400),
      setTimeout(() => setProgress((p) => (p === 'adding-homepage' ? 'finalizing' : p)), 1800),
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
    return (
      <SuccessScreen
        appId={appId}
        secret={secret}
        useEnvDatabase={useEnvDatabase}
        dbUrl={dbUrl.trim()}
        dbToken={dbToken.trim()}
        extras={extras}
        envMedia={envMedia}
        envAi={envAi}
        host={host}
        hostEnvUrl={hostEnvUrl}
      />
    )
  }

  const progressPercent = ((stepIndex + 1) / steps.length) * 100

  return (
    <div className="setup-layout">
      <div className="setup-sidebar">
        <BrandHeader />
        <h1>Set up your site</h1>
        <p className="lede">
          {isLocal
            ? 'Three steps, then one restart — and your site is running.'
            : 'Three steps, then one redeploy — and your site is live.'}
        </p>

        <ol className="stepper">
          {ALL_STEPS.map((entry) => {
            if (useEnvDatabase && entry.id === 'database') {
              return (
                <li key={entry.id} className="done satisfied">
                  <span className="stepper-link">
                    <span className="stepper-icon ok">
                      <svg
                        width="1em"
                        height="1em"
                        viewBox="0 0 24 24"
                        data-name="Line Color"
                        xmlns="http://www.w3.org/2000/svg"
                        className="icon line-color"
                      >
                        <path
                          style={{
                            fill: 'none',
                            stroke: 'currentColor',
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                            strokeWidth: 2,
                          }}
                          d="m5 12 5 5 9-9"
                        />
                      </svg>
                    </span>
                    <span className="stepper-text">
                      <span className="stepper-title">{entry.title}</span>
                      <span className="stepper-desc">{entry.description}</span>
                    </span>
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
                  <span className={`stepper-icon ${state === 'done' ? 'ok' : ''}`}>
                    {state === 'done' ? (
                      <svg
                        width="1em"
                        height="1em"
                        viewBox="0 0 24 24"
                        data-name="Line Color"
                        xmlns="http://www.w3.org/2000/svg"
                        className="icon line-color"
                      >
                        <path
                          style={{
                            fill: 'none',
                            stroke: 'currentColor',
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                            strokeWidth: 2,
                          }}
                          d="m5 12 5 5 9-9"
                        />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="stepper-text">
                    <span className="stepper-title">{entry.title}</span>
                    <span className="stepper-desc">{entry.description}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <div className="sidebar-footer">
          <div className="sidebar-footer-title">NEED A HAND?</div>
          <div className="sidebar-footer-text">
            Every field here can be changed later from Settings.
            <br />
            <NewTabLink href="https://www.chaibuilder.com/docs">Read the setup docs</NewTabLink>
          </div>
        </div>
      </div>

      <div className="setup-main">
        <form className="setup-form" onSubmit={goNext} noValidate>
          <div className="step-indicator">
            STEP {stepIndex + 1} / {steps.length}
            <div className="step-indicator-bar">
              <div className="step-indicator-progress" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <div className="step-head">
            <h2 ref={headingRef} tabIndex={-1}>
              {current.id === 'site'
                ? 'Your site and login'
                : current.id === 'database'
                  ? 'Sql Database'
                  : 'Review and create'}
            </h2>
          </div>

          <div className="card-body">
            {current.id === 'site' && (
              <>
                <label htmlFor="appName">Site name</label>
                <input
                  id="appName"
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="My Company"
                  autoFocus
                />
                <div className="field-hint">Shown in the admin sidebar and browser tab.</div>

                <label htmlFor="email">Admin email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <div className="field-hint">
                  This will be admin email & will be used for login in builder.
                </div>

                <label htmlFor="password">Password</label>
                <div className="password-field">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 4 characters"
                  />
                  <button
                    type="button"
                    className="link"
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="field-hint">Use at least 4 characters</div>
              </>
            )}

            {current.id === 'database' && (
              <>
                {envDatabase.state === 'broken' && (
                  <div className="note warn">
                    This deployment has database settings, but we could not use them:{' '}
                    {envDatabase.error} Enter them again below.
                  </div>
                )}
                {isLocal ? (
                  <p className="hint">
                    Your pages and content live in a hosted libSQL database. Paste its address and
                    token below. You can use{' '}
                    <NewTabLink href="https://turso.tech">Turso</NewTabLink>, it works well.
                  </p>
                ) : (
                  <p className="hint">
                    Your pages and content live in a hosted libSQL database — a free one from{' '}
                    <NewTabLink href="https://turso.tech">Turso</NewTabLink> works well. Create it,
                    then copy its <code>libsql://</code> address here.
                  </p>
                )}

                <label htmlFor="dbUrl">Database URL</label>
                <input
                  id="dbUrl"
                  type="text"
                  value={dbUrl}
                  onChange={(e) => setDbUrl(e.target.value)}
                  placeholder={isLocal ? 'file:./payload.db' : 'libsql://your-database.turso.io'}
                />

                <label htmlFor="dbToken">Database token</label>
                <div className="field-hint">
                  {isLocal
                    ? 'Only for hosted databases — leave this empty when the URL is a file.'
                    : 'Your provider issues one alongside the URL and will refuse the connection without it.'}
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

            {current.id === 'review' && (
              <>
                <p className="hint">
                  We will create your database tables, your admin account, and your site. This can
                  take up to a minute — keep this page open.
                </p>
                <dl className="review-list">
                  <ReviewRow label="Site name" value={appName.trim()} onEdit={() => goTo('site')} />
                  {useEnvDatabase ? (
                    <ReviewRow label="Database" value="Already configured on this deployment" />
                  ) : (
                    <ReviewRow
                      label="Database"
                      value={dbUrl.trim()}
                      onEdit={() => goTo('database')}
                    />
                  )}
                  <ReviewRow label="Admin email" value={email.trim()} onEdit={() => goTo('site')} />
                </dl>

                <p className="field-hint extras-lede">
                  Storage and AI are optional. Add them now and they ship with the same settings —
                  otherwise leave them closed and follow the docs later.
                </p>
                <ExtrasFields
                  value={extras}
                  onChange={setExtras}
                  envMedia={envMedia}
                  envAi={envAi}
                />
              </>
            )}
          </div>

          {stepError && (
            <div className="note error" style={{ marginTop: '24px', marginBottom: '0px' }}>
              {stepError}
            </div>
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
              {isLast ? (
                <button type="button" onClick={handleCreate} disabled={running}>
                  {running ? 'Setting up…' : 'Create my site'}
                </button>
              ) : (
                <button type="submit" disabled={checking}>
                  {checking ? 'Checking…' : 'Continue'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {running && (
        <div className="loader-overlay">
          <div className="loader-glow" />
          <ul className="loader-steps">
            {PROGRESS_LABELS.map((entry, index) => {
              const currentIndex = PROGRESS_LABELS.findIndex((e) => e.key === progress)
              const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : ''
              return (
                <li key={entry.key} className={`loader-step ${state}`}>
                  <div className="loader-icon">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  {entry.label}
                </li>
              )
            })}
          </ul>
        </div>
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
    <div className="review-row" style={{ whiteSpace: 'nowrap' }}>
      <dt>{label}</dt>
      <dd>
        {value ? (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
        ) : (
          <span className="muted-value">Not set</span>
        )}
        {onEdit && (
          <button type="button" className="link" onClick={onEdit}>
            Change
          </button>
        )}
      </dd>
    </div>
  )
}
