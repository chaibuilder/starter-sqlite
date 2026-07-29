import { adminUrl } from '@/utilities/adminRoute'
import { isConfigured } from '@/lib/is-configured'
import { envDbCredentials, openDb } from '../lib/db'
import { describeDbError, getSetupStatus } from '../lib/status'
import { SetupWizard, type EnvDatabase } from './wizard'
import { ExtrasForms } from './ExtrasForms'
import { BrandHeader } from './BrandHeader'

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
    return {
      state: 'broken',
      url: credentials.url,
      error: describeDbError(error, { hadToken: Boolean(credentials.authToken) }),
    }
  } finally {
    client.close()
  }
}

/**
 * Whether uploads already have somewhere to live. Presence only — unlike the
 * database there is no cheap round-trip that proves a bucket works, so the
 * wizard never claims to have verified it. It only decides whether the success
 * screen warns that uploads will not survive a redeploy.
 */
function hasEnvMedia(): boolean {
  return Boolean(
    process.env.BUCKET_NAME && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY,
  )
}

export default async function SetupPage() {
  if (!isConfigured()) {
    return <SetupWizard envDatabase={await probeEnvDatabase()} envMedia={hasEnvMedia()} />
  }

  const status = await getSetupStatus()
  const problems = status.checks.filter((check) => check.state === 'error')
  // `getSetupStatus` is the single source of truth for what is configured: the
  // same check that renders a row also decides whether its form is offered.
  const needsMedia = status.checks.some((check) => check.id === 'media' && check.state === 'warn')
  const needsAi = status.checks.some((check) => check.id === 'ai' && check.state === 'warn')
  const needsSiteUrl = status.checks.some(
    (check) => check.id === 'site-url' && check.state === 'warn',
  )

  return (
    <div className="wrap">
      <BrandHeader />
      <h1>{problems.length === 0 ? 'Your site is set up' : 'Your site needs attention'}</h1>
      <p className="lede">
        {problems.length === 0
          ? 'Everything required is in place. Below is the current state of your site.'
          : 'Some required settings are not working. Details are below.'}
      </p>

      <div className="scroll-area">
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

        <ExtrasForms media={needsMedia} ai={needsAi} />

        {needsSiteUrl && (
          <div className="card">
            <h2>Set your site address</h2>
            <p className="hint">
              Add <code>NEXT_PUBLIC_SERVER_URL</code> with your site&rsquo;s full address so
              sitemaps and shared links are correct, then redeploy.
            </p>
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

        <p className="hint">
          Setup disables itself once configured, so it is safe to leave in place. To remove it,
          delete <code>src/app/(setup)</code> and the <code>/setup</code> redirect in{' '}
          <code>src/proxy.ts</code>.
        </p>
      </div>
    </div>
  )
}
