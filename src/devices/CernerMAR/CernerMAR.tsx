import { cerner } from '../../design/deviceTokens'
import { Button } from '../../design/primitives'
import { DeviceStatusBadge } from '../shared'
import { getDrug } from '../../data/formulary'
import type { Infusion } from '../../state/types'

export interface CernerMARProps {
  infusions: Infusion[]
  /** Direct/ungated — Begin Bag hangs the bag and charts in MAR; verification happens once, when the starting dose is programmed. */
  onCompleteBeginBag: (infusionId: string) => void
  /** True while a verification confirmation is pending elsewhere on the page. */
  disabled?: boolean
}

/**
 * Faithful (not stylized) replica of the Cerner MAR — Begin Bag + initial rate (CP 4-156).
 * Phase 17: same props/columns/logic, reskinned only — alternating row shading and the
 * shared DeviceStatusBadge, matching the rest of the Cerner surfaces (CernerIView,
 * InfusionsPanel, CernerChartingStatus). Rate-CHANGE history deliberately stays out of
 * this table (see CernerIView.tsx's Continuous Infusions section for that) — MAR here
 * is still a single-snapshot table per CLAUDE.md's placement rule ("Begin Bag + initial
 * rate in MAR; subsequent titrations in iView").
 */
export function CernerMAR({ infusions, onCompleteBeginBag, disabled }: CernerMARProps) {
  return (
    <div className="overflow-hidden rounded-md border" style={{ borderColor: cerner.gridLine }}>
      <div
        className="px-3 py-2 text-sm font-semibold"
        style={{ backgroundColor: cerner.chrome, color: cerner.chromeText }}
      >
        MAR — Medication Administration Record
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ color: cerner.ink }}>
          <thead>
            <tr style={{ backgroundColor: cerner.surfaceAlt }}>
              {['Medication', 'Begin Bag', 'Initial Rate', 'Channel'].map((h) => (
                <th
                  key={h}
                  className="border-b px-3 py-1.5 text-left text-xs font-semibold uppercase whitespace-nowrap"
                  style={{ borderColor: cerner.gridLine, color: cerner.muted }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {infusions.map((infusion, i) => {
              const drug = getDrug(infusion.drugId)
              return (
                <tr
                  key={infusion.id}
                  className="border-b last:border-0"
                  style={{ borderColor: cerner.gridLine, backgroundColor: i % 2 === 1 ? cerner.surfaceAlt : cerner.surface }}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{drug.name}</div>
                    <div className="text-xs" style={{ color: cerner.muted }}>
                      {drug.concentration.amount} {drug.concentration.amountUnit}/{drug.concentration.volumeMl} mL
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {infusion.beginBagCompleted ? (
                      <DeviceStatusBadge label="Completed" backgroundColor={cerner.completeBg} color={cerner.complete} />
                    ) : (
                      <div className="flex items-center gap-2">
                        <DeviceStatusBadge label="Not Completed" backgroundColor={cerner.pendingBg} color={cerner.pending} />
                        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onCompleteBeginBag(infusion.id)}>
                          Begin Bag
                        </Button>
                      </div>
                    )}
                  </td>
                  {/* Fixed at initiation — never updated by later titrations (those chart in iView). */}
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                    {infusion.initialRate != null ? `${infusion.initialRate} ${drug.unit}` : '—'}
                  </td>
                  <td className="px-3 py-2">{infusion.channel}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
