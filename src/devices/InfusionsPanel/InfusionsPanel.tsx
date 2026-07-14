import { cn } from '../../design/cn'
import { cerner } from '../../design/deviceTokens'
import { getDrug } from '../../data/formulary'
import type { Infusion, InfusionStatus } from '../../state/types'

export interface InfusionsPanelProps {
  infusions: Infusion[]
}

const STATUS_LABEL: Record<InfusionStatus, string> = {
  hanging: 'Hanging',
  infusing: 'Infusing',
  stopped: 'Stopped',
}

const STATUS_COLOR: Record<InfusionStatus, string> = {
  hanging: cerner.pending,
  infusing: cerner.complete,
  stopped: cerner.stopped,
}

/** Faithful (not stylized) replica of the Cerner Current Infusions view — hanging vs infusing. */
export function InfusionsPanel({ infusions }: InfusionsPanelProps) {
  return (
    <div className="overflow-hidden rounded-md border" style={{ borderColor: cerner.gridLine }}>
      <div
        className="px-3 py-2 text-sm font-semibold"
        style={{ backgroundColor: cerner.chrome, color: cerner.chromeText }}
      >
        Current Infusions
      </div>
      <ul>
        {infusions.map((infusion, i) => {
          const drug = getDrug(infusion.drugId)
          return (
            <li
              key={infusion.id}
              className={cn('flex items-center justify-between px-3 py-2 text-sm', i < infusions.length - 1 && 'border-b')}
              style={{ color: cerner.ink, borderColor: cerner.gridLine }}
            >
              <div>
                <div className="font-medium">{drug.name}</div>
                <div className="text-xs" style={{ color: cerner.muted }}>
                  Channel {infusion.channel} · {infusion.rate} {drug.unit}
                </div>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                style={{ backgroundColor: STATUS_COLOR[infusion.status] }}
              >
                {STATUS_LABEL[infusion.status]}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
