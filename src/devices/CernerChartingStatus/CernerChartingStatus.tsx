import { cerner } from '../../design/deviceTokens'
import { DeviceStatusBadge } from '../shared'
import { getDrug } from '../../data/formulary'
import { buildCadenceStatusForOrders, type CadenceCheck } from '../../engine/documentation'
import { formatClock } from '../../lib/time'
import type { Infusion, LogEntry, Order } from '../../state/types'

export interface CernerChartingStatusProps {
  orders: Order[]
  infusions: Infusion[]
  log: LogEntry[]
  verificationFlags: Record<string, boolean>
}

function cadenceLabel(check: CadenceCheck): string {
  switch (check.point) {
    case 'initiation':
      return 'Initiation'
    case 'plus30Start':
      return '+30 min after start'
    case 'preTitration':
      return `Pre-titration #${check.titrationIndex}`
    case 'plus30PostTitration':
      return `+30 min after titration #${check.titrationIndex}`
  }
}

/** Phase 17: thin wrapper over the shared DeviceStatusBadge, preserving this
 *  component's own met/not-met -> complete/pending color mapping exactly as before. */
function CadenceBadge({ met, label }: { met: boolean; label: string }) {
  return <DeviceStatusBadge label={label} backgroundColor={met ? cerner.completeBg : cerner.pendingBg} color={met ? cerner.complete : cerner.pending} />
}

/**
 * Faithful (not stylized) live self-check — per infusion, whether BCMA/I-TRACE
 * verification happened and which CP 4-156 documentation-cadence checkpoints are
 * charted vs. still due. Reuses buildCadenceStatusForOrders (engine/documentation.ts),
 * the same source scoring.ts's debrief category consumes, so what's shown here can
 * never drift from what debrief actually scores. Purely informational — never blocks
 * ending the session (see Simulation.tsx's soft pre-end warning for that).
 *
 * Leads with a compact "X of Y charted" summary and lists ONLY outstanding checkpoints
 * — a long guided-titration run can rack up dozens of checkpoints that are all already
 * satisfied by dense auto-charting, and a full row-per-checkpoint table buried real gaps
 * in a wall of "Charted" rows (confirmed during a walkthrough: genuinely-due checkpoints
 * near the end of a long run were technically shown but scrolled well out of view).
 */
export function CernerChartingStatus({ orders, infusions, log, verificationFlags }: CernerChartingStatusProps) {
  const doseEntries = log.filter((e) => e.type === 'action' && e.doseAction != null)
  const chartedMinutes = log.filter((e) => e.type === 'documentation' && e.location === 'iView').map((e) => e.minute)
  const statuses = buildCadenceStatusForOrders(orders, infusions, doseEntries, chartedMinutes)

  return (
    <div className="overflow-hidden rounded-md border" style={{ borderColor: cerner.gridLine }}>
      <div
        className="px-3 py-2 text-sm font-semibold"
        style={{ backgroundColor: cerner.chrome, color: cerner.chromeText }}
      >
        Charting Status
      </div>
      {statuses.length === 0 ? (
        <p className="px-3 py-4 text-sm" style={{ color: cerner.muted }}>
          No infusion has been started yet — nothing due.
        </p>
      ) : (
        <div className="flex flex-col divide-y" style={{ color: cerner.ink, borderColor: cerner.gridLine }}>
          {statuses.map((status) => {
            const drug = getDrug(status.drugId)
            const initiateEntry = doseEntries.find((e) => e.orderId === status.orderId && e.doseAction === 'initiate')
            const verified = initiateEntry ? verificationFlags[initiateEntry.id] === true : null
            const met = status.checks.filter((c) => c.met).length
            const outstanding = status.checks.filter((c) => !c.met)
            return (
              <div key={status.orderId} className="px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{drug.name}</span>
                  <div className="flex items-center gap-2">
                    {verified != null && <CadenceBadge met={verified} label={verified ? 'Verified' : 'Not yet verified'} />}
                    <CadenceBadge met={outstanding.length === 0} label={`${met} of ${status.checks.length} charted`} />
                  </div>
                </div>
                {outstanding.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-1">
                    {outstanding.map((check, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 text-sm">
                        <span>{cadenceLabel(check)}</span>
                        <span className="font-mono text-xs whitespace-nowrap" style={{ color: cerner.muted }}>
                          due {formatClock(check.dueAtMinute)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm" style={{ color: cerner.complete }}>
                    All caught up.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
