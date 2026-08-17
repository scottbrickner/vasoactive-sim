import { formatClock } from '../lib/time'
import type { VitalSigns } from '../state/types'

export interface StatusStripProps {
  clockMinutes: number
  vitals: VitalSigns
  targetLabel?: string
}

/**
 * Phase 18's live-vitals surface for the "clean workspace" screen, replacing
 * PhilipsMonitor here (that component stays importable, just unrouted from this
 * screen — see Simulation.tsx). No waveforms, per the validated mockup — just the
 * numbers a nurse actually reasons from at the bedside.
 */
export function StatusStrip({ clockMinutes, vitals, targetLabel }: StatusStripProps) {
  const cells: { label: string; value: string }[] = [
    { label: 'Clock', value: `${formatClock(clockMinutes)}` },
    { label: 'MAP', value: `${vitals.map} mmHg` },
    { label: 'HR', value: `${vitals.hr} bpm` },
    { label: 'BP', value: `${vitals.sbp}/${vitals.dbp}` },
    { label: 'SpO2', value: `${vitals.spo2}%` },
  ]
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-surface p-3 shadow-sm">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col">
          <span className="text-xs font-semibold tracking-wide text-muted uppercase">{cell.label}</span>
          <span className="font-mono text-lg font-bold text-ink tabular-nums">{cell.value}</span>
        </div>
      ))}
      {targetLabel && (
        <span className="ml-auto rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-cardinal-dark">
          Target {targetLabel}
        </span>
      )}
    </div>
  )
}
