import { formatClock } from '../lib/time'
import type { Order, VitalSigns } from '../state/types'

export interface StatusStripProps {
  clockMinutes: number
  vitals: VitalSigns
  /** Every order in the session — used only to gate the conditional RASS/painScore cells below (MAP/HR/BP/SpO2 stay unconditional). */
  orders: Order[]
  /** One chip per order's target clause (see engine/orderText.ts's formatTargetClause), Phase 19b's widening from a single primary-order chip. */
  targetLabels?: string[]
}

/**
 * Phase 18's live-vitals surface for the "clean workspace" screen, replacing
 * PhilipsMonitor here (that component stays importable, just unrouted from this
 * screen — see Simulation.tsx). No waveforms, per the validated mockup — just the
 * numbers a nurse actually reasons from at the bedside. RASS/painScore cells (Phase 19b)
 * show only when some order in the session actually targets them, so a vasoactive-only
 * scenario doesn't grow two permanently-inert cells.
 */
export function StatusStrip({ clockMinutes, vitals, orders, targetLabels }: StatusStripProps) {
  const cells: { label: string; value: string }[] = [
    { label: 'Clock', value: `${formatClock(clockMinutes)}` },
    { label: 'MAP', value: `${vitals.map} mmHg` },
    { label: 'HR', value: `${vitals.hr} bpm` },
    { label: 'BP', value: `${vitals.sbp}/${vitals.dbp}` },
    { label: 'SpO2', value: `${vitals.spo2}%` },
  ]
  if (orders.some((o) => o.target.metric === 'RASS')) {
    cells.push({ label: 'RASS', value: `${vitals.rass}` })
  }
  if (orders.some((o) => o.target.metric === 'painScore')) {
    cells.push({ label: 'Pain score', value: `${vitals.painScore}` })
  }
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-surface p-3 shadow-sm">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col">
          <span className="text-xs font-semibold tracking-wide text-muted uppercase">{cell.label}</span>
          <span className="font-mono text-lg font-bold text-ink tabular-nums">{cell.value}</span>
        </div>
      ))}
      {targetLabels && targetLabels.length > 0 && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Deduped, preserving first-occurrence order — a multi-agent scenario where
              several orders share an identical formatted target clause (e.g. three
              pressors all targeting "MAP >= 65 mmHg") should render that chip once, not
              once per order. */}
          {[...new Set(targetLabels)].map((label, i) => (
            // Keyed by position, not label text — even after dedup, positions stay
            // stable within the deduped array, so a positional key remains safe (and
            // labels could in principle repeat non-adjacently after future formatting
            // changes, so this avoids relying on label text as a key at all).
            <span
              key={i}
              className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-cardinal-dark"
            >
              Target {label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
