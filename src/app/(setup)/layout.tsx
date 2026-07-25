import type { Metadata } from 'next'
import './setup.css'

export const metadata: Metadata = {
  title: 'Set up your site | ChaiBuilder',
  robots: { index: false, follow: false },
}

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
