import { adminUrl } from '@/utilities/adminRoute'
import { isConfigured } from '@/lib/is-configured'
import { envDbCredentials, openDb } from '@/lib/setup/db'
import { describeDbError, getSetupStatus } from '@/lib/setup/status'
import { SetupWizard, type EnvDatabase } from './wizard'

// Setup reflects live environment and database state, so it must never be
// cached or prerendered.
export const dynamic = 'force-dynamic'

const BADGE_SYMBOL = { ok: '✓', warn: '!', error: '✕' } as const

/**
 * Whether this deployment already carries usable database credentials, e.g. the
 * user filled them in while deploying. When they work the wizard skips asking.
 *
 * Only the URL is returned: `DATABASE_AUTH_TOKEN` must never reach the browser,
 * so setup runs against the environment credentials server-side instead.
 */
async function probeEnvDatabase(): Promise<EnvDatabase> {
  const credentials = envDbCredentials()
  if (!credentials) return { state: 'absent' }

  const client = openDb(credentials)
  try {
    await client.execute('SELECT 1')
    return { state: 'ready', url: credentials.url }
  } catch (error) {
    return { state: 'broken', url: credentials.url, error: describeDbError(error) }
  } finally {
    client.close()
  }
}

export default async function SetupPage() {
  if (!isConfigured()) {
    return <SetupWizard envDatabase={await probeEnvDatabase()} />
  }

  const status = await getSetupStatus()
  const problems = status.checks.filter((check) => check.state === 'error')
  const suggestions = status.checks.filter((check) => check.state === 'warn')

  return (
    <div className="wrap">
      <div className="brand">ChaiBuilder</div>
      <h1>{problems.length === 0 ? 'Your site is set up' : 'Your site needs attention'}</h1>
      <p className="lede">
        {problems.length === 0
          ? 'Everything required is in place. Below is the current state of your site.'
          : 'Some required settings are not working. Details are below.'}
      </p>

      <div className="card">
        <ul className="checklist">
          {status.checks.map((check) => (
            <li key={check.id}>
              <span className={`badge ${check.state}`}>{BADGE_SYMBOL[check.state]}</span>
              <span>
                <span className="check-label">{check.label}</span>
                <br />
                <span className="check-detail">{check.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {suggestions.length > 0 && (
        <div className="card">
          <h2>Recommended next steps</h2>
          {suggestions.some((check) => check.id === 'media') && (
            <>
              <h3>Turn on media storage</h3>
              <p className="hint">
                Add <code>BUCKET_NAME</code>, <code>AWS_ACCESS_KEY_ID</code> and{' '}
                <code>AWS_SECRET_ACCESS_KEY</code> to your environment variables, then deploy again.
                Cloudflare R2 also needs <code>S3_ENDPOINT</code>.
              </p>
            </>
          )}
          {suggestions.some((check) => check.id === 'ai') && (
            <>
              <h3>Turn on AI features</h3>
              <p className="hint">
                Add <code>OPENROUTER_API_KEY</code> from <a href="https://openrouter.ai">
                  OpenRouter
                </a>{' '}
                to write and edit content with AI.
              </p>
            </>
          )}
          {suggestions.some((check) => check.id === 'site-url') && (
            <>
              <h3>Set your site address</h3>
              <p className="hint">
                Add <code>NEXT_PUBLIC_SERVER_URL</code> with your site&rsquo;s full address so
                sitemaps and shared links are correct.
              </p>
            </>
          )}
        </div>
      )}

      <div className="card">
        <h2>Your site</h2>
        {status.appId && (
          <p className="hint">
            Site ID: <code>{status.appId}</code>
          </p>
        )}
        <div className="actions">
          <a href={adminUrl('editor')}>
            <button type="button">Open the editor</button>
          </a>
          <a href="/">
            <button type="button" className="secondary">
              View your site
            </button>
          </a>
        </div>
      </div>
    </div>
  )
}
