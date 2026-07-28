import { adminUrl } from '@/utilities/adminRoute'
import { isConfigured } from '@/lib/is-configured'
import { envDbCredentials, openDb, redactDbUrl } from '@/lib/setup/db'
import { describeDbError, getSetupStatus } from '@/lib/setup/status'
import { SetupWizard, type EnvDatabase, type EnvExtras } from './wizard'
import { BrandHeader } from './BrandHeader'

// Setup reflects live environment and database state, so it must never be
// cached or prerendered.
export const dynamic = 'force-dynamic'

const BADGE_SYMBOL = { ok: '✓', warn: '!', error: '✕' } as const

/**
 * Whether this deployment already carries usable database credentials, e.g. the
 * user filled them in while deploying. When they work the wizard skips asking.
 *
 * Only a redacted URL is returned: a Postgres connection string contains the
 * password, so the real one must never reach the browser. Setup runs against the
 * environment credentials server-side instead.
 */
async function probeEnvDatabase(): Promise<EnvDatabase> {
  const credentials = envDbCredentials()
  if (!credentials) return { state: 'absent' }

  const client = openDb(credentials)
  try {
    await client.execute('SELECT 1')
    return { state: 'ready', url: redactDbUrl(credentials.url) }
  } catch (error) {
    return {
      state: 'broken',
      url: redactDbUrl(credentials.url),
      error: describeDbError(error),
    }
  } finally {
    client.close()
  }
}

/**
 * Optional services this deployment already carries settings for.
 *
 * Presence only — unlike the database there is no cheap round-trip that proves
 * an S3 bucket or an AI key works, so the wizard says "already set" rather than
 * claiming it verified them.
 */
function probeEnvExtras(): EnvExtras {
  return {
    media: Boolean(
      process.env.BUCKET_NAME && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY,
    ),
    ai: Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY),
  }
}

export default async function SetupPage() {
  if (!isConfigured()) {
    return <SetupWizard envDatabase={await probeEnvDatabase()} envExtras={probeEnvExtras()} />
  }

  const status = await getSetupStatus()
  const problems = status.checks.filter((check) => check.state === 'error')
  const suggestions = status.checks.filter((check) => check.state === 'warn')

  return (
    <div className="wrap">
      <BrandHeader />
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
          {/* Styled links rather than buttons wrapped in anchors, which is
              invalid HTML and confuses keyboard and assistive-tech users. */}
          <a className="button-link" href={adminUrl('editor')}>
            Open the editor
          </a>
          <a className="button-link secondary" href="/">
            View your site
          </a>
        </div>
      </div>
    </div>
  )
}
