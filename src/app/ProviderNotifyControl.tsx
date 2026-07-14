import { useState } from 'react'
import { Button, Field } from '../design/primitives'

export interface ProviderNotifyControlProps {
  onNotify: (reason: string) => void
  disabled?: boolean
}

/** Shell-register control for CP 4-156 provider notification, e.g. when an agent is at its ordered max with target unmet. */
export function ProviderNotifyControl({ onNotify, disabled }: ProviderNotifyControlProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  if (!open) {
    return (
      <Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>
        Notify provider
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4 shadow-sm">
      <Field
        label="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Norepinephrine at max, MAP still below target"
      />
      <div className="flex gap-3">
        <Button
          onClick={() => {
            onNotify(reason)
            setOpen(false)
            setReason('')
          }}
        >
          Send notification
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
