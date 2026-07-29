// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { detectHost, hostEnvUrl } from '@/app/(setup)/lib/host'

/**
 * Host detection decides which set of "paste these and redeploy" instructions
 * the last screen shows, so a wrong answer sends the user to the wrong
 * dashboard. The Netlify cases matter most: the obvious variable to test for
 * (`NETLIFY`) is build-only, so detecting on it would pass under `netlify dev`
 * and fail on the deployed site.
 */
const HOST_VARS = [
  'VERCEL',
  'VERCEL_URL',
  'VERCEL_PROJECT_ID',
  'NETLIFY',
  'SITE_ID',
  'SITE_NAME',
] as const

afterEach(() => {
  for (const key of HOST_VARS) delete process.env[key]
})

describe('detectHost', () => {
  it('returns unknown when nothing identifies the platform', () => {
    expect(detectHost()).toBe('unknown')
  })

  it('detects Vercel from VERCEL', () => {
    process.env.VERCEL = '1'
    expect(detectHost()).toBe('vercel')
  })

  it.each(['VERCEL_URL', 'VERCEL_PROJECT_ID'])(
    'still detects Vercel from %s when system variables are switched off',
    (key) => {
      process.env[key] = 'x'
      expect(detectHost()).toBe('vercel')
    },
  )

  it('detects Netlify from the variables functions actually receive', () => {
    process.env.SITE_ID = '1d01c0c0-4554-4747-93b8-34ce3448ab95'
    expect(detectHost()).toBe('netlify')
  })

  it('does not treat NETLIFY alone as Netlify — it is build-only', () => {
    process.env.NETLIFY = 'true'
    expect(detectHost()).toBe('unknown')
  })

  it('prefers Vercel when both look present', () => {
    process.env.VERCEL = '1'
    process.env.SITE_ID = 'abc'
    expect(detectHost()).toBe('vercel')
  })
})

describe('hostEnvUrl', () => {
  it('uses Vercel’s own placeholder redirect rather than guessing slugs', () => {
    const url = hostEnvUrl('vercel')
    expect(url).toContain('https://vercel.com/d?to=')
    // Decoded, the target is /[team]/[project]/settings/environment-variables.
    expect(decodeURIComponent(url!)).toContain('/[team]/[project]/settings/environment-variables')
  })

  it('builds the Netlify URL from SITE_NAME', () => {
    process.env.SITE_NAME = 'petsof'
    expect(hostEnvUrl('netlify')).toBe(
      'https://app.netlify.com/projects/petsof/configuration/env',
    )
  })

  it('returns null for Netlify without a site name rather than a broken link', () => {
    expect(hostEnvUrl('netlify')).toBeNull()
  })

  it('returns null for an unknown host', () => {
    expect(hostEnvUrl('unknown')).toBeNull()
  })
})
