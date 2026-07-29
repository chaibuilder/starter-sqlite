import type { Metadata, Viewport } from 'next'
import './setup.css'

export const metadata: Metadata = {
  title: 'Set up your site | ChaiBuilder',
  robots: { index: false, follow: false },
}

/**
 * Declared explicitly rather than relying on the framework default: the shell is
 * exactly one viewport tall, so a phone that lays the page out at desktop width
 * would push the primary button off-screen. `viewportFit: 'cover'` lets the
 * stylesheet pad for notches and home indicators via `env(safe-area-inset-*)`.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
