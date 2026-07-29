'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Copy-to-clipboard button with a short-lived confirmation. Used by the wizard,
 * the success screen and the optional media/AI forms.
 */
export function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = '✓ Copied',
  className,
  disabled,
}: {
  value: string
  label?: string
  copiedLabel?: string
  className?: string
  disabled?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Without this, the timeout fires after the button has gone (switching AI
  // provider, leaving a step) and React warns about setting state on unmounted.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => setCopied(false), 2500)
        })
      }}
    >
      {copied ? copiedLabel : label}
    </button>
  )
}
