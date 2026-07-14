import { cerner } from '../../design/deviceTokens'
import { getDrug } from '../../data/formulary'
import type { Order } from '../../state/types'

export interface OrdersProfileProps {
  orders: Order[]
}

function formatInterval(interval: Order['interval']): string {
  return interval.maxMinutes ? `q${interval.minMinutes}-${interval.maxMinutes} min` : `q${interval.minMinutes} min`
}

/** Faithful (not stylized) replica of the Cerner Orders profile — the titratable order(s). */
export function OrdersProfile({ orders }: OrdersProfileProps) {
  const sorted = [...orders].sort((a, b) => a.sequence - b.sequence)
  return (
    <div className="overflow-hidden rounded-md border" style={{ borderColor: cerner.gridLine }}>
      <div
        className="px-3 py-2 text-sm font-semibold"
        style={{ backgroundColor: cerner.chrome, color: cerner.chromeText }}
      >
        Orders — Titratable IV Infusions
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ color: cerner.ink }}>
          <thead>
            <tr style={{ backgroundColor: cerner.surfaceAlt }}>
              {['Agent', 'Drug', 'Start', 'Increment', 'Interval', 'Max', 'Target'].map((h) => (
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
            {sorted.map((order) => {
              const drug = getDrug(order.drugId)
              return (
                <tr key={order.id} className="border-b last:border-0" style={{ borderColor: cerner.gridLine }}>
                  <td className="px-3 py-2 font-medium">#{order.sequence}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{drug.name}</td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                    {order.startDose} {drug.unit}
                  </td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                    {order.increment} {drug.unit}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatInterval(order.interval)}</td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                    {order.maxDose} {drug.unit}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {order.target.metric} {order.target.comparator} {order.target.value} {order.target.unit}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {sorted.some((o) => o.activatesWhen) && (
        <div
          className="border-t px-3 py-2 text-xs"
          style={{ borderColor: cerner.gridLine, color: cerner.muted, backgroundColor: cerner.surfaceAlt }}
        >
          {sorted
            .filter((o) => o.activatesWhen)
            .map((o) => (
              <p key={o.id}>
                <strong>Agent {o.sequence}</strong> activates when: {o.activatesWhen}
              </p>
            ))}
        </div>
      )}
    </div>
  )
}
