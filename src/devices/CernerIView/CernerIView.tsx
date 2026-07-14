import { cerner } from '../../design/deviceTokens'
import { Button } from '../../design/primitives'
import { formatClock, formatRelativeMinutes } from '../../lib/time'
import type { PriorVitalsPoint, VitalSigns } from '../../state/types'

export interface ChartedVitalsEntry {
  minute: number
  vitals: VitalSigns
}

export interface CernerIViewProps {
  priorVitals: PriorVitalsPoint[]
  startingVitals: VitalSigns
  chartedEntries: ChartedVitalsEntry[]
  onChartNow: () => void
  canChartNow: boolean
}

const ROWS: { label: string; read: (v: VitalSigns) => string }[] = [
  { label: 'HR', read: (v) => String(v.hr) },
  { label: 'BP', read: (v) => `${v.sbp}/${v.dbp}` },
  { label: 'MAP', read: (v) => String(v.map) },
  { label: 'SpO2', read: (v) => String(v.spo2) },
  { label: 'Rhythm', read: (v) => v.rhythm },
]

/**
 * Faithful (not stylized) replica of the Cerner iView flowsheet band.
 *
 * Deliberately does NOT label columns with the CP 4-156 documentation-cadence checkpoints
 * ("At initiation", "+30 min after start", …) — a real flowsheet has no such labels, it
 * just shows result times as they're charted. Historical columns (before sim start) are
 * safe to show in full — that's context a nurse coming onto shift always sees — but
 * everything from sim start on is charted only when the learner actually charts it,
 * timestamped to the real sim clock, never a template of expected checkpoints.
 */
export function CernerIView({
  priorVitals,
  startingVitals,
  chartedEntries,
  onChartNow,
  canChartNow,
}: CernerIViewProps) {
  const historicalColumns = [...priorVitals]
    .sort((a, b) => b.minutesBeforeStart - a.minutesBeforeStart)
    .map((p) => ({ label: formatRelativeMinutes(p.minutesBeforeStart), vitals: p.vitals }))
  const startColumn = { label: formatClock(0), vitals: startingVitals }
  const liveColumns = [...chartedEntries]
    .sort((a, b) => a.minute - b.minute)
    .map((e) => ({ label: formatClock(e.minute), vitals: e.vitals }))
  const columns = [...historicalColumns, startColumn, ...liveColumns]

  return (
    <div className="overflow-hidden rounded-md border" style={{ borderColor: cerner.gridLine }}>
      <div
        className="px-3 py-2 text-sm font-semibold"
        style={{ backgroundColor: cerner.chrome, color: cerner.chromeText }}
      >
        iView — Flowsheet
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ color: cerner.ink }}>
          <thead>
            <tr style={{ backgroundColor: cerner.surfaceAlt }}>
              <th
                className="border-b px-3 py-1.5 text-left text-xs font-semibold uppercase whitespace-nowrap"
                style={{ borderColor: cerner.gridLine, color: cerner.muted }}
              >
                Parameter
              </th>
              {columns.map((c, i) => (
                <th
                  key={i}
                  className="border-b px-3 py-1.5 text-left text-xs font-semibold whitespace-nowrap"
                  style={{ borderColor: cerner.gridLine, color: cerner.muted }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-b last:border-0" style={{ borderColor: cerner.gridLine }}>
                <td className="px-3 py-2 font-medium whitespace-nowrap">{row.label}</td>
                {columns.map((c, i) => (
                  <td key={i} className="px-3 py-2 whitespace-nowrap">
                    {row.read(c.vitals)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t px-3 py-2" style={{ borderColor: cerner.gridLine, backgroundColor: cerner.surfaceAlt }}>
        <Button size="sm" disabled={!canChartNow} onClick={onChartNow}>
          Chart now
        </Button>
      </div>
    </div>
  )
}
