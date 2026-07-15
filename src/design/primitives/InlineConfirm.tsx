import { useEffect, useState } from 'react'

export interface InlineConfirmProps {
  /** A new value (e.g. an incrementing counter) triggers a fresh show + auto-dismiss cycle. Null renders nothing. */
  trigger: number | null
  message: string
}

/**
 * A brief (~1.5s auto-dismiss) acknowledgment rendered right next to the control that
 * triggered it — "yes, that went through." Complements, doesn't replace, the
 * page-level Toast: Toast still carries substantive coaching/violation copy, this only
 * ever carries a short confirmation, so the two never say conflicting things.
 */
export function InlineConfirm({ trigger, message }: InlineConfirmProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (trigger == null) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 1500)
    return () => clearTimeout(timer)
  }, [trigger])

  if (!visible) return null

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success"
    >
      <span aria-hidden="true">✓</span>
      {message}
    </span>
  )
}
