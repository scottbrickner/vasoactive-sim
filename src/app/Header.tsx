import { useShellStore } from '../state/store'
import type { HeaderReadout } from '../state/types'

function formatClock(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes))
  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

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

/** Persistent branded header: USC wordmark + live sim clock / current MAP / target readout. */
export function Header() {
  const header = useShellStore((s) => s.header)
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
      <Stat
        label="Current MAP"
        value={header.currentMap == null ? '—' : String(header.currentMap)}
        unit="mmHg"
        emphasis
      />
      <div className="h-8 w-px bg-white/20" aria-hidden="true" />
      <Stat label="Target MAP" value={`≥ ${header.targetMap}`} unit="mmHg" />
    </div>
  )
}
