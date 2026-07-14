import { BLOCK_OF_CHARTING } from '../data/policy'
import { getDrug } from '../data/formulary'
import { isBlockOverMaxDuration, minutesStopped } from '../engine/infusionLifecycle'
import { formatClock } from '../lib/time'
import { Button } from '../design/primitives'
import type { BlockOfChartingRecord, Infusion, Order } from '../state/types'

export interface BlockOfChartingControlProps {
  orders: Order[]
  infusions: Infusion[]
  activeBlock: BlockOfChartingRecord | null
  clockMinutes: number
  onDeclare: (orderId: string) => void
  onClose: () => void
  disabled?: boolean
}

/**
 * Shell-register control for CP 4-156's emergent Block of Charting pathway — "if there
 * is an immediate risk to patient safety... the RN may titrate as needed." Declaring a
 * block lets submitDose bypass order-compliance checks for that agent (see store.ts);
 * this control is where the nurse opens/closes that window and is reminded what to chart.
 */
export function BlockOfChartingControl({
  orders,
  infusions,
  activeBlock,
  clockMinutes,
  onDeclare,
  onClose,
  disabled,
}: BlockOfChartingControlProps) {
  if (activeBlock) {
    const drug = getDrug(activeBlock.drugId)
    const elapsed = minutesStopped(clockMinutes, activeBlock.startMinute)
    const overDuration = isBlockOverMaxDuration(activeBlock.startMinute, clockMinutes)
    return (
      <div className="flex flex-col gap-3 rounded-md border border-gold-dark/40 bg-gold-soft p-4 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-cardinal-dark">Block of Charting in effect — {drug.name}</p>
          <p className="mt-1 text-sm text-ink">
            Started {formatClock(activeBlock.startMinute)} · {elapsed} min elapsed
            {overDuration && ' — past 4 hr, close and start a new block.'}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted uppercase">Document before closing</p>
          <ul className="mt-1 list-inside list-disc text-xs text-muted">
            {BLOCK_OF_CHARTING.requiredElements.map((el) => (
              <li key={el}>{el}</li>
            ))}
          </ul>
        </div>
        <div>
          <Button size="sm" disabled={disabled} onClick={onClose}>
            Close Block of Charting
          </Button>
        </div>
      </div>
    )
  }

  const eligibleOrders = orders.filter((o) => infusions.some((i) => i.orderId === o.id && i.status === 'infusing'))
  if (eligibleOrders.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm font-semibold text-ink">Block of Charting</p>
      <p className="text-sm text-muted">
        For an immediate risk to patient safety, titrate as needed without the usual order limits — document
        everything when you close the block.
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        {eligibleOrders.map((order) => {
          const drug = getDrug(order.drugId)
          return (
            <Button key={order.id} size="sm" variant="secondary" disabled={disabled} onClick={() => onDeclare(order.id)}>
              Declare for {drug.name}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
