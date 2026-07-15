import { useState } from 'react'
import { Button, InlineConfirm, Panel } from '../design/primitives'
import { getDrug } from '../data/formulary'
import { formatClock } from '../lib/time'
import type { LogEntry, VitalSigns } from '../state/types'

export interface TitrationTimelineProps {
  log: LogEntry[]
  vitalsHistory: { minute: number; vitals: VitalSigns }[]
  disabled?: boolean
  onChartRetrospective: (minute: number) => void
}

/**
 * A nurse who's been busy titrating doesn't always chart in the moment — this lets
 * them pick a past titration's minute and backdate a chart entry to it. Vitals are
 * auto-filled from vitalsHistory (what genuinely happened then), never freely
 * entered — this isn't testing recall, just giving a better way to see when each
 * titration happened and catch up on documentation for it.
 */
export function TitrationTimeline({ log, vitalsHistory, disabled, onChartRetrospective }: TitrationTimelineProps) {
  const [openMinute, setOpenMinute] = useState<number | null>(null)
  const [confirmTick, setConfirmTick] = useState<number | null>(null)

  const titrations = log
    .filter((e) => e.type === 'action' && e.doseAction != null && e.outcome === 'applied')
    .sort((a, b) => a.minute - b.minute)

  if (titrations.length === 0) {
    return (
      <Panel title="Titration timeline" subtitle="Times of each titration, for backdated charting">
        <p className="text-sm text-muted">No titrations yet this session.</p>
      </Panel>
    )
  }

  const vitalsAt = (minute: number) =>
    vitalsHistory.filter((h) => h.minute <= minute).reduce<{ minute: number; vitals: VitalSigns } | null>(
      (best, h) => (best == null || h.minute > best.minute ? h : best),
      null,
    )

  return (
    <Panel title="Titration timeline" subtitle="Times of each titration, for backdated charting">
      <ul className="flex flex-col gap-2">
        {titrations.map((entry) => {
          const drug = entry.drugId ? getDrug(entry.drugId) : null
          const isOpen = openMinute === entry.minute
          const historical = vitalsAt(entry.minute)
          return (
            <li key={entry.id} className="rounded-md border border-border">
              <button
                type="button"
                disabled={disabled}
                onClick={() => setOpenMinute(isOpen ? null : entry.minute)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm disabled:opacity-50"
              >
                <span className="font-mono text-muted">{formatClock(entry.minute)}</span>
                <span className="flex-1 text-ink">
                  {entry.doseAction === 'initiate' ? 'Initiate' : 'Titrate'} {drug?.name ?? ''} to {entry.dose}{' '}
                  {drug?.unit ?? ''}
                </span>
                <span aria-hidden="true" className="text-muted">
                  {isOpen ? '▾' : '▸'}
                </span>
              </button>
              {isOpen && historical && (
                <div className="border-t border-border bg-bg px-3 py-3">
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                    Vitals at {formatClock(entry.minute)}
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                    <Reading label="HR" value={String(historical.vitals.hr)} />
                    <Reading label="BP" value={`${historical.vitals.sbp}/${historical.vitals.dbp}`} />
                    <Reading label="MAP" value={String(historical.vitals.map)} />
                    <Reading label="SpO2" value={String(historical.vitals.spo2)} />
                  </dl>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        onChartRetrospective(entry.minute)
                        setConfirmTick((t) => (t ?? 0) + 1)
                      }}
                    >
                      Chart for this time
                    </Button>
                    <InlineConfirm trigger={confirmTick} message="Charted" />
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-ink">{value}</dd>
    </div>
  )
}
