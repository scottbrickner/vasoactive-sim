import { useSimStore } from '../state/store'
import type { HeaderReadout } from '../state/types'
import { formatClock } from '../lib/time'
import { formatTargetClause } from '../engine/orderText'
import { resolveTargetValue } from '../engine/titrationEngine'

interface StatProps {
  label: string
  value: string
  unit?: string
  emphasis?: boolean
}

function Stat({ label, value, unit, emphasis }: StatProps) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-[0.65rem] font-semibold tracking-wide text-white/70 uppercase">
        {label}
      </span>
      <span className="font-heading tabular-nums text-white">
        <span className={emphasis ? 'text-2xl font-bold' : 'text-xl font-semibold'}>{value}</span>
        {unit && <span className="ml-1 text-sm font-medium text-white/70">{unit}</span>}
      </span>
    </div>
  )
}

/**
 * Persistent branded header: USC wordmark + live sim clock / current value / target
 * readout for the sequence-1 order's own target metric (MAP/HR/RASS/painScore).
 */
export function Header() {
  const phase = useSimStore((s) => s.phase)
  const clockMinutes = useSimStore((s) => s.clockMinutes)
  const vitals = useSimStore((s) => s.vitals)
  const orders = useSimStore((s) => s.orders)
  const primaryOrder = orders.find((o) => o.sequence === 1)

  // Live vitals are meaningless noise on the intro screen — nothing has started yet.
  const noLiveReadout = phase === 'intro'

  const header: HeaderReadout = {
    clockMinutes,
    currentValueLabel:
      noLiveReadout || !primaryOrder
        ? null
        : `${primaryOrder.target.metric} ${resolveTargetValue(vitals, primaryOrder.target.metric)} ${primaryOrder.target.unit}`,
    // The intro screen picks its own random scenario, independent of the store's
    // last-loaded one — showing that stale target here would misleadingly suggest it's
    // the upcoming scenario's goal. Blank it until the sim actually starts.
    targetLabel: noLiveReadout || !primaryOrder ? null : formatTargetClause(primaryOrder.target),
  }

  return (
    <header className="sticky top-0 z-40 border-b-4 border-gold bg-cardinal text-white shadow-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-gutter py-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-md bg-white/10 font-heading text-lg font-bold text-gold"
          >
            USC
          </span>
          <div className="leading-tight">
            <p className="font-heading text-base font-bold sm:text-lg">Vasoactive Titration Simulator</p>
            <p className="text-xs text-white/70">USC Norris Cancer Hospital · Oncology ICU</p>
          </div>
        </div>
        <HeaderStats header={header} />
      </div>
    </header>
  )
}

function HeaderStats({ header }: { header: HeaderReadout }) {
  return (
    <div className="flex items-center gap-4 sm:gap-6" aria-label="Simulation status">
      <Stat label="Sim time" value={formatClock(header.clockMinutes)} />
      <div className="h-8 w-px bg-white/20" aria-hidden="true" />
      <Stat label="Current" value={header.currentValueLabel ?? '—'} emphasis />
      <div className="h-8 w-px bg-white/20" aria-hidden="true" />
      <Stat label="Target" value={header.targetLabel ?? '—'} />
    </div>
  )
}
