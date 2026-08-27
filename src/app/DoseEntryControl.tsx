import { useState } from 'react'
import { Button, InlineConfirm } from '../design/primitives'
import type { PumpChannelInfo } from '../devices/AlarisPump/AlarisPump'
import type { LogEntry } from '../state/types'

export interface DoseEntryControlProps {
  info: PumpChannelInfo
  onRequestProgram: (orderId: string, dose: number) => void
  onTitrate: (orderId: string, dose: number) => LogEntry | null
  onBeginBag: (orderId: string) => void
  onPause: (infusionId: string) => void
  onRestart: (infusionId: string) => void
  onDiscontinue: (infusionId: string) => void
  disabled?: boolean
}

/**
 * Phase 18's primary, always-available interaction — real hands-on dose entry, per the
 * user's explicit instruction that free titration stays the default even once decision
 * points are layered on top. Extracted from AlarisChannelModule.tsx (Phase 17): same
 * native `<input type=number>` + Program/Titrate/Pause/Restart/Discontinue mechanic,
 * same validation, but flat-styled to the shell register (Panel/Button, `design/tokens`
 * palette) instead of the photorealistic LCD/LED chrome — the new "clean workspace"
 * screen shows no pump chrome at all (see titration-judgment-mockup.html). The full
 * AlarisChannelModule/AlarisPump components are untouched and still importable for any
 * future screen that wants the faithful-replica register back.
 */
export function DoseEntryControl({
  info,
  onRequestProgram,
  onTitrate,
  onBeginBag,
  onPause,
  onRestart,
  onDiscontinue,
  disabled,
}: DoseEntryControlProps) {
  const { order, drug, infusion, isActivated } = info
  const [doseInput, setDoseInput] = useState('')
  const [confirmTick, setConfirmTick] = useState<number | null>(null)
  const [confirmMessage, setConfirmMessage] = useState('')
  const fireConfirm = (message: string) => {
    setConfirmMessage(message)
    setConfirmTick((t) => (t ?? 0) + 1)
  }

  if (!infusion && !isActivated) {
    return (
      <div className="rounded-md border border-border bg-bg p-3">
        <p className="text-sm font-semibold text-ink">{drug.name} — not yet available</p>
        <p className="mt-1 text-sm text-muted">{order.activatesWhen}</p>
      </div>
    )
  }

  // Sequence>1 order just became activation-eligible but has no infusion yet — unlike a
  // sequence-1 order (pre-seeded `hanging` by the scenario at minute 0), this order has
  // never had a bag hung. Give it the same visible Begin Bag step before Program appears,
  // rather than letting Program show up with zero bag-hanging moment (see
  // beginBagForOrder in state/store.ts).
  if (!infusion && isActivated) {
    return (
      <div className="rounded-md border border-border bg-bg p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-ink">{drug.name}</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Ordered range {order.startDose}–{order.maxDose} {drug.unit}
        </p>
        <div className="mt-3">
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => {
              onBeginBag(order.id)
              fireConfirm('Begin Bag complete')
            }}
          >
            Begin Bag
          </Button>
        </div>
        <InlineConfirm trigger={confirmTick} message={confirmMessage} />
      </div>
    )
  }

  const paused = infusion?.status === 'stopped'
  const canProgram = (!infusion || infusion.beginBagCompleted) && !disabled && !paused
  const parsed = Number(doseInput)
  const isValidNumber = doseInput.trim() !== '' && Number.isFinite(parsed) && parsed > 0

  return (
    <div className="rounded-md border border-border bg-bg p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-ink">{drug.name}</span>
        <span className="font-mono text-2xl font-bold tabular-nums text-ink">
          {infusion?.rate ?? 0} <span className="text-sm font-normal text-muted">{drug.unit}</span>
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Ordered range {order.startDose}–{order.maxDose} {drug.unit}
      </p>

      {paused && infusion ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => {
              onRestart(infusion.id)
              fireConfirm('Restarted')
            }}
          >
            Restart at {infusion.rateBeforePause} {drug.unit}
          </Button>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => { onDiscontinue(infusion.id); fireConfirm('Discontinued') }}>
            Discontinue
          </Button>
          <InlineConfirm trigger={confirmTick} message={confirmMessage} />
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`dose-entry-${order.id}`}>
            Dose ({drug.unit})
          </label>
          <input
            id={`dose-entry-${order.id}`}
            type="number"
            step="any"
            inputMode="decimal"
            value={doseInput}
            onChange={(e) => setDoseInput(e.target.value)}
            placeholder={`Dose (${drug.unit})`}
            disabled={!canProgram}
            className="h-9 w-32 rounded-md border border-border bg-surface px-2 font-mono text-sm text-ink disabled:opacity-50"
          />
          <Button
            size="sm"
            disabled={!canProgram || !isValidNumber}
            onClick={() => {
              if (infusion?.status === 'infusing') {
                const entry = onTitrate(order.id, parsed)
                if (entry) fireConfirm(`Titrated to ${parsed}`)
              } else {
                onRequestProgram(order.id, parsed)
              }
              setDoseInput('')
            }}
          >
            {infusion?.status === 'infusing' ? 'Titrate' : 'Program'}
          </Button>
          {infusion?.status === 'infusing' && (
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => { onPause(infusion.id); fireConfirm('Paused') }}>
              Pause
            </Button>
          )}
          {infusion && (
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => { onDiscontinue(infusion.id); fireConfirm('Discontinued') }}>
              Discontinue
            </Button>
          )}
          <InlineConfirm trigger={confirmTick} message={confirmMessage} />
          {infusion && !infusion.beginBagCompleted && !paused && (
            <p className="w-full text-xs text-cardinal-dark">Complete Begin Bag in the MAR below before programming the starting dose.</p>
          )}
        </div>
      )}
    </div>
  )
}
