import { alaris } from '../../design/deviceTokens'
import { getDrug } from '../../data/formulary'
import type { Concentration, DoseUnit, Infusion, Order } from '../../state/types'

export interface AlarisPumpProps {
  infusions: Infusion[]
  orders: Order[]
}

/**
 * Faithful (not stylized) replica of an Alaris Model 8015 / Guardrails Suite MX channel
 * screen. Static for Phase 3 — dose entry and live soft/hard-limit evaluation are the
 * guardrails engine (Phase 4) and the wired loop (Phase 5).
 */
export function AlarisPump({ infusions, orders }: AlarisPumpProps) {
  return (
    <div className="flex flex-col gap-3">
      {infusions.map((infusion) => {
        const order = orders.find((o) => o.id === infusion.orderId)
        const drug = getDrug(infusion.drugId)
        return (
          <PumpChannel
            key={infusion.id}
            infusion={infusion}
            order={order}
            drugName={drug.name}
            unit={drug.unit}
            concentration={drug.concentration}
          />
        )
      })}
    </div>
  )
}

interface ChannelStatus {
  text: string
  tone: 'idle' | 'active' | 'stopped'
}

function channelStatus(infusion: Infusion): ChannelStatus {
  if (infusion.status === 'hanging' && !infusion.beginBagCompleted) {
    return { text: 'AWAITING BEGIN BAG', tone: 'idle' }
  }
  if (infusion.status === 'infusing') return { text: 'INFUSING', tone: 'active' }
  if (infusion.status === 'stopped') return { text: 'STOPPED', tone: 'stopped' }
  return { text: 'NOT STARTED', tone: 'idle' }
}

interface PumpChannelProps {
  infusion: Infusion
  order?: Order
  drugName: string
  unit: DoseUnit
  concentration: Concentration
}

function PumpChannel({ infusion, order, drugName, unit, concentration }: PumpChannelProps) {
  const status = channelStatus(infusion)
  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: alaris.chassis }}>
      <div className="flex items-center justify-between px-1 pb-2">
        <span
          className="rounded-full px-2 py-0.5 text-xs font-bold text-white"
          style={{ backgroundColor: alaris.chassisDark }}
        >
          CHANNEL {infusion.channel}
        </span>
        <StatusBadge status={status} />
      </div>

      <div className="rounded-sm p-3 font-mono" style={{ backgroundColor: alaris.lcd, color: alaris.lcdInk }}>
        <div className="flex items-baseline justify-between text-sm font-semibold">
          <span>{drugName}</span>
          <span style={{ color: alaris.lcdMuted }}>
            {concentration.amount} {concentration.amountUnit}/{concentration.volumeMl} mL
          </span>
        </div>
        <div className="mt-2 text-3xl font-bold tabular-nums">
          {infusion.rate} <span className="text-base font-normal">{unit}</span>
        </div>
        {order && (
          <div className="mt-2 flex items-center justify-between text-xs" style={{ color: alaris.lcdMuted }}>
            <span>Guardrails range (per order)</span>
            <span>
              {order.startDose}–{order.maxDose} {unit}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: ChannelStatus }) {
  const color =
    status.tone === 'active' ? alaris.activeGreen : status.tone === 'stopped' ? alaris.hardLimit : alaris.softLimit
  return (
    <span className="rounded px-2 py-0.5 text-[0.65rem] font-bold text-white" style={{ backgroundColor: color }}>
      {status.text}
    </span>
  )
}
