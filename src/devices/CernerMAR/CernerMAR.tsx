import { cerner } from '../../design/deviceTokens'
import { getDrug } from '../../data/formulary'
import type { Infusion, Order } from '../../state/types'

export interface CernerMARProps {
  infusions: Infusion[]
  orders: Order[]
}

/** Faithful (not stylized) replica of the Cerner MAR — Begin Bag + initial rate (CP 4-156). */
export function CernerMAR({ infusions, orders }: CernerMARProps) {
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
            {infusions.map((infusion) => {
              const order = orders.find((o) => o.id === infusion.orderId)
              const drug = getDrug(infusion.drugId)
              return (
                <tr key={infusion.id} className="border-b last:border-0" style={{ borderColor: cerner.gridLine }}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{drug.name}</div>
                    <div className="text-xs" style={{ color: cerner.muted }}>
                      {drug.concentration.amount} {drug.concentration.amountUnit}/{drug.concentration.volumeMl} mL
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <BeginBagBadge complete={infusion.beginBagCompleted} />
                  </td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                    {order ? `${order.startDose} ${drug.unit}` : '—'}
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

function BeginBagBadge({ complete }: { complete: boolean }) {
  return (
    <span
      className="rounded px-2 py-0.5 text-xs font-semibold"
      style={{
        backgroundColor: complete ? cerner.completeBg : cerner.pendingBg,
        color: complete ? cerner.complete : cerner.pending,
      }}
    >
      {complete ? 'Completed' : 'Not Completed'}
    </span>
  )
}
