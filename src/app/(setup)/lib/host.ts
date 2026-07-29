/**
 * Which host this deployment runs on, and a link to where its environment
 * variables are edited.
 *
 * Setup ends by asking the user to paste variables into their host and redeploy,
 * so detecting the host turns "on Vercel do this, on Netlify do that" into one
 * set of instructions for the place they are actually standing.
 */

export type Host = 'vercel' | 'netlify' | 'unknown'

/**
 * Vercel's docs link to their own settings pages through a redirect that
 * resolves `[team]` and `[project]` against the signed-in user's dashboard.
 *
 * This exists because the dashboard URL is built from the team slug and project
 * name, and neither is exposed to a running deployment: `VERCEL_PROJECT_ID` is
 * available but no dashboard route accepts an id, and deriving the slugs from
 * `VERCEL_GIT_REPO_OWNER`/`VERCEL_GIT_REPO_SLUG` is wrong often enough to be
 * worse than no link — project names are lowercased, renameable, and one repo
 * can back several projects.
 */
const VERCEL_ENV_SETTINGS =
  'https://vercel.com/d?to=' +
  encodeURIComponent('/[team]/[project]/settings/environment-variables') +
  '&title=' +
  encodeURIComponent('Go to Environment Variables')

/**
 * `VERCEL` is set at build and at runtime — but a project can switch system
 * variables off, so fall back to two other members of the same set rather than
 * mislabelling the host as unknown.
 *
 * Netlify is deliberately *not* detected through `NETLIFY`: that one is
 * build-only, and present under `netlify dev`, so relying on it works locally
 * and silently fails in production. Functions get `SITE_ID`, `SITE_NAME` and
 * `URL`, and nothing else.
 */
export function detectHost(): Host {
  if (process.env.VERCEL || process.env.VERCEL_URL || process.env.VERCEL_PROJECT_ID) return 'vercel'
  if (process.env.SITE_ID || process.env.SITE_NAME) return 'netlify'
  return 'unknown'
}

/** Where to edit environment variables on this host, or null if we cannot say. */
export function hostEnvUrl(host: Host): string | null {
  if (host === 'vercel') return VERCEL_ENV_SETTINGS
  // Netlify's path is keyed on the site name alone — no team segment to guess —
  // and `SITE_NAME` hands it over verbatim at runtime.
  if (host === 'netlify' && process.env.SITE_NAME) {
    return `https://app.netlify.com/projects/${process.env.SITE_NAME}/configuration/env`
  }
  return null
}
