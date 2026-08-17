import { useState } from 'react'
import { cerner } from '../../design/deviceTokens'
import { Button, InlineConfirm } from '../../design/primitives'
import { getDrug } from '../../data/formulary'
import { rateAtMinute } from '../../engine/infusionRateHistory'
import { formatClock, formatRelativeMinutes } from '../../lib/time'
import type { Infusion, LogEntry, Order, PriorVitalsPoint, VitalSigns } from '../../state/types'

export interface ChartedVitalsEntry {
  minute: number
  vitals: VitalSigns
  /** True when this entry was backdated via the titration timeline rather than charted live. */
  retrospective?: boolean
  /** True when this entry was auto-charted by a multi-step titration plan rather than charted individually. */
  autoCharted?: boolean
}

export interface CernerIViewProps {
  priorVitals: PriorVitalsPoint[]
  startingVitals: VitalSigns
  chartedEntries: ChartedVitalsEntry[]
  /** Phase 17: drives the new Continuous Infusions rate-history section, below. */
  orders: Order[]
  infusions: Infusion[]
  log: LogEntry[]
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
 *
 * Phase 17: added a "Continuous Infusions" rate-history section (above the vitals rows),
 * matching the real Cerner MAR's own "Continuous Infusions" grid — one row per order
 * that's ever been infused, with a cell per column showing the rate in effect (via
 * engine/infusionRateHistory.ts) and a distinct "Rate Change X.X" treatment on the exact
 * column where a real logged initiate/titrate landed. Historical (pre-sim-start)
 * columns show "—" for this section — there's no real infusion-rate concept before the
 * scenario began, unlike vitals (which DO have real prior-shift data via priorVitals).
 */
export function CernerIView({
  priorVitals,
  startingVitals,
  chartedEntries,
  orders,
  infusions,
  log,
  onChartNow,
  canChartNow,
}: CernerIViewProps) {
  const [confirmTick, setConfirmTick] = useState<number | null>(null)
  const historicalColumns = [...priorVitals]
    .sort((a, b) => b.minutesBeforeStart - a.minutesBeforeStart)
    .map((p) => ({ label: formatRelativeMinutes(p.minutesBeforeStart), vitals: p.vitals, minute: null as number | null }))
  const startColumn = { label: formatClock(0), vitals: startingVitals, minute: 0 }
  const liveColumns = [...chartedEntries]
    .sort((a, b) => a.minute - b.minute)
    .map((e) => {
      const tags = [e.retrospective && 'backdated', e.autoCharted && 'auto-charted'].filter(Boolean).join(', ')
      return { label: tags ? `${formatClock(e.minute)} (${tags})` : formatClock(e.minute), vitals: e.vitals, minute: e.minute }
    })
  const columns = [...historicalColumns, startColumn, ...liveColumns]

  // Only orders that have ever been infused (a real dose/discontinue entry, or a
  // scenario-pre-seeded already-infusing infusion) get a rate row — an order that's
  // still locked/never activated has nothing to show here yet.
  const infusedOrders = orders.filter(
    (o) =>
      log.some((e) => e.type === 'action' && e.orderId === o.id && (e.doseAction != null || e.lifecycleAction === 'discontinue')) ||
      infusions.some((i) => i.orderId === o.id && i.status !== 'hanging'),
  )

  let rowIndex = 0
  const stripe = () => (rowIndex++ % 2 === 1 ? cerner.surfaceAlt : cerner.surface)

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
            {infusedOrders.length > 0 && (
              <tr>
                <th
                  colSpan={1 + columns.length}
                  className="px-3 py-1.5 text-left text-xs font-semibold tracking-wide uppercase"
                  style={{ backgroundColor: cerner.continuousInfusionsHeader, color: cerner.chromeText }}
                >
                  Continuous Infusions
                </th>
              </tr>
            )}
            {infusedOrders.map((order) => {
              const drug = getDrug(order.drugId)
              return (
                <tr key={order.id} className="border-b last:border-0" style={{ borderColor: cerner.gridLine, backgroundColor: stripe() }}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{drug.name}</td>
                  {columns.map((c, i) => {
                    if (c.minute == null) {
                      return (
                        <td key={i} className="px-3 py-2 whitespace-nowrap" style={{ color: cerner.muted }}>
                          —
                        </td>
                      )
                    }
                    const entry = rateAtMinute(order.id, log, infusions, c.minute)
                    if (entry.discontinued) {
                      return (
                        <td key={i} className="px-3 py-2 whitespace-nowrap" style={{ color: cerner.stopped }}>
                          D/C
                        </td>
                      )
                    }
                    if (entry.rate == null) {
                      return (
                        <td key={i} className="px-3 py-2 whitespace-nowrap" style={{ color: cerner.muted }}>
                          —
                        </td>
                      )
                    }
                    return (
                      <td
                        key={i}
                        className="px-3 py-2 whitespace-nowrap"
                        style={
                          entry.isRateChangeAtMinute
                            ? { backgroundColor: cerner.rateChangeBg, color: cerner.rateChangeText, fontWeight: 700 }
                            : undefined
                        }
                      >
                        {entry.isRateChangeAtMinute ? 'Rate Change ' : ''}
                        {entry.rate} {drug.unit}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {ROWS.map((row) => (
              <tr key={row.label} className="border-b last:border-0" style={{ borderColor: cerner.gridLine, backgroundColor: stripe() }}>
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
      <div
        className="flex items-center gap-2 border-t px-3 py-2"
        style={{ borderColor: cerner.gridLine, backgroundColor: cerner.surfaceAlt }}
      >
        <Button
          size="sm"
          disabled={!canChartNow}
          onClick={() => {
            onChartNow()
            setConfirmTick((t) => (t ?? 0) + 1)
          }}
        >
          Chart now
        </Button>
        <InlineConfirm trigger={confirmTick} message="Charted" />
      </div>
    </div>
  )
}
