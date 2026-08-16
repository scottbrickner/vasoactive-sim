import { AlarisCentralModule } from './AlarisCentralModule'
import { AlarisChannelModule } from './AlarisChannelModule'
import type { DrugDefinition, Infusion, Order } from '../../state/types'

export interface PumpChannelInfo {
  channel: string
  order: Order
  drug: DrugDefinition
  /** null until the learner has initiated this order's infusion. */
  infusion: Infusion | null
  /** Always true for a sequence-1 order; for sequence > 1, whether the activation condition is currently met. */
  isActivated: boolean
}

export interface AlarisPumpProps {
  channels: PumpChannelInfo[]
  clockMinutes: number
  /** Initiating a new infusion — gated by VerificationPanel upstream (Simulation.tsx). */
  onRequestProgram: (orderId: string, dose: number) => void
  /** Titrating an already-infusing order — direct/ungated, like onPause (see CLAUDE.md's narrowed verification scope). */
  onTitrate: (orderId: string, dose: number) => void
  /** Stops the infusion. Not verification-gated — no drug identity/dose is administered by pausing. */
  onPause: (infusionId: string) => void
  /** Resumes at the rate in effect before the pause. Direct/ungated. */
  onRestart: (infusionId: string) => void
  /** Removes the infusion from the pump. Direct/ungated. */
  onDiscontinue: (infusionId: string) => void
  /** True while a verification confirmation is pending elsewhere on the page. */
  disabled?: boolean
}

/**
 * Faithful (not stylized) replica of an Alaris Model 8015 / Guardrails Suite MX ganged
 * pump array. The learner enters their OWN dose (CLINICAL_SPEC.md #6 — free-choice dosing;
 * the sim never pre-fills or hints the correct value) and requests programming; the
 * actual Guardrails/order evaluation happens in the store after the verification gate
 * (initiation only — titration/restart/discontinue are direct).
 *
 * Phase 17: rebuilt from a simple vertical card stack into the real hardware's ganged
 * layout — one decorative AlarisCentralModule flanked by up to 4 small-LCD
 * AlarisChannelModule units (channels split roughly in half, left/right of center at
 * `md:` and above; a plain vertical stack below `md`, matching the app's existing
 * responsive convention). `overflow-x-auto` lets a 3–4-channel array scroll rather than
 * silently clip on a narrow `md` viewport — the actual controls/props/callbacks on each
 * channel are completely unchanged from before this phase, only the surrounding chrome
 * and layout moved.
 */
export function AlarisPump({
  channels,
  clockMinutes,
  onRequestProgram,
  onTitrate,
  onPause,
  onRestart,
  onDiscontinue,
  disabled,
}: AlarisPumpProps) {
  const half = Math.ceil(channels.length / 2)
  const left = channels.slice(0, half)
  const right = channels.slice(half)

  const channelModule = (info: PumpChannelInfo) => (
    <AlarisChannelModule
      key={info.order.id}
      info={info}
      clockMinutes={clockMinutes}
      onRequestProgram={onRequestProgram}
      onTitrate={onTitrate}
      onPause={onPause}
      onRestart={onRestart}
      onDiscontinue={onDiscontinue}
      disabled={disabled}
    />
  )

  return (
    <div className="md:overflow-x-auto">
      <div className="flex flex-col gap-3 md:min-w-max md:flex-row md:items-start">
        {left.length > 0 && <div className="flex flex-col gap-3 md:flex-1">{left.map(channelModule)}</div>}
        <AlarisCentralModule />
        {right.length > 0 && <div className="flex flex-col gap-3 md:flex-1">{right.map(channelModule)}</div>}
      </div>
    </div>
  )
}
