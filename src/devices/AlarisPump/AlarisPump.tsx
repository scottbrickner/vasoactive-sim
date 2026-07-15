import { useState } from 'react'
import { alaris } from '../../design/deviceTokens'
import { Button, InlineConfirm } from '../../design/primitives'
import { isPastRemovalThreshold, minutesStopped } from '../../engine/infusionLifecycle'
import type { DrugDefinition, Infusion, Order } from '../../state/types'

/**
 * Ghost-style device buttons (Pause/Discontinue) on the dark chassis — the shell
 * Button's `ghost` variant is `text-cardinal` on transparent, tuned for the light shell
 * background, and was illegible here (WCAG AA contrast failure). Inline `style` wins
 * over the variant's utility classes regardless of Tailwind's generated CSS order.
 */
const DEVICE_GHOST_STYLE = { color: alaris.lcd, borderColor: alaris.lcdMuted } as const

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
 * Faithful (not stylized) replica of an Alaris Model 8015 / Guardrails Suite MX channel
 * screen. The learner enters their OWN dose (CLINICAL_SPEC.md #6 — free-choice dosing;
 * the sim never pre-fills or hints the correct value) and requests programming; the
 * actual Guardrails/order evaluation happens in the store after the verification gate
 * (initiation only — titration/restart/discontinue are direct).
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
  return (
    <div className="flex flex-col gap-3">
      {channels.map((info) => (
        <PumpChannel
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
      ))}
    </div>
  )
}

type ChannelTone = 'idle' | 'active' | 'stopped' | 'locked'

function channelStatus(info: PumpChannelInfo): { text: string; tone: ChannelTone } {
  if (!info.infusion) {
    return info.isActivated ? { text: 'READY TO PROGRAM', tone: 'idle' } : { text: 'LOCKED', tone: 'locked' }
  }
  if (info.infusion.status === 'hanging' && !info.infusion.beginBagCompleted) {
    return { text: 'AWAITING BEGIN BAG', tone: 'idle' }
  }
  if (info.infusion.status === 'infusing') return { text: 'INFUSING', tone: 'active' }
  if (info.infusion.status === 'stopped') return { text: 'PAUSED', tone: 'stopped' }
  return { text: 'READY TO PROGRAM', tone: 'idle' }
}

interface PumpChannelProps {
  info: PumpChannelInfo
  clockMinutes: number
  onRequestProgram: (orderId: string, dose: number) => void
  onTitrate: (orderId: string, dose: number) => void
  onPause: (infusionId: string) => void
  onRestart: (infusionId: string) => void
  onDiscontinue: (infusionId: string) => void
  disabled?: boolean
}

function PumpChannel({
  info,
  clockMinutes,
  onRequestProgram,
  onTitrate,
  onPause,
  onRestart,
  onDiscontinue,
  disabled,
}: PumpChannelProps) {
  const { order, drug, infusion, isActivated } = info
  const status = channelStatus(info)
  const [doseInput, setDoseInput] = useState('')
  // Inline "yes, that went through" tags — complement, not replace, the page-level
  // Toast (which already covers initiate/Program via VerificationPanel's confirm flow).
  const [confirmTick, setConfirmTick] = useState<number | null>(null)
  const [confirmMessage, setConfirmMessage] = useState('')
  const fireConfirm = (message: string) => {
    setConfirmMessage(message)
    setConfirmTick((t) => (t ?? 0) + 1)
  }

  if (!infusion && !isActivated) {
    return (
      <div className="rounded-lg p-3" style={{ backgroundColor: alaris.chassis }}>
        <div className="flex items-center justify-between px-1 pb-2">
          <ChannelBadge channel={info.channel} />
          <StatusBadge status={status} />
        </div>
        <div className="rounded-sm p-3 text-sm" style={{ backgroundColor: alaris.lcd, color: alaris.lcdMuted }}>
          <p className="font-semibold" style={{ color: alaris.lcdInk }}>
            {drug.name} — not yet programmed
          </p>
          <p className="mt-1">{order.activatesWhen}</p>
        </div>
      </div>
    )
  }

  const paused = infusion?.status === 'stopped'
  const canProgram = (!infusion || infusion.beginBagCompleted) && !disabled && !paused
  const parsed = Number(doseInput)
  const isValidNumber = doseInput.trim() !== '' && Number.isFinite(parsed) && parsed > 0

  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: alaris.chassis }}>
      <div className="flex items-center justify-between px-1 pb-2">
        <ChannelBadge channel={info.channel} />
        <StatusBadge status={status} />
      </div>

      <div className="rounded-sm p-3 font-mono" style={{ backgroundColor: alaris.lcd, color: alaris.lcdInk }}>
        <div className="flex items-baseline justify-between text-sm font-semibold">
          <span>{drug.name}</span>
          <span style={{ color: alaris.lcdMuted }}>
            {drug.concentration.amount} {drug.concentration.amountUnit}/{drug.concentration.volumeMl} mL
          </span>
        </div>
        <div className="mt-2 text-3xl font-bold tabular-nums">
          {infusion?.rate ?? 0} <span className="text-base font-normal">{drug.unit}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs" style={{ color: alaris.lcdMuted }}>
          <span>Guardrails range (per order)</span>
          <span>
            {order.startDose}–{order.maxDose} {drug.unit}
          </span>
        </div>
        {paused && infusion?.stoppedAtMinute != null && (
          <PausedNotice clockMinutes={clockMinutes} stoppedAtMinute={infusion.stoppedAtMinute} />
        )}
      </div>

      {paused && infusion ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => {
              onRestart(infusion.id)
              fireConfirm('Restarted')
            }}
          >
            Restart at {infusion.rateBeforePause} {drug.unit}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="border"
            style={DEVICE_GHOST_STYLE}
            disabled={disabled}
            onClick={() => {
              onDiscontinue(infusion.id)
              fireConfirm('Discontinued')
            }}
          >
            Discontinue
          </Button>
          <InlineConfirm trigger={confirmTick} message={confirmMessage} />
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`dose-${order.id}`}>
            Dose ({drug.unit})
          </label>
          <input
            id={`dose-${order.id}`}
            type="number"
            step="any"
            inputMode="decimal"
            value={doseInput}
            onChange={(e) => setDoseInput(e.target.value)}
            placeholder={`Dose (${drug.unit})`}
            disabled={!canProgram}
            className="h-9 w-32 rounded border bg-white px-2 font-mono text-sm text-ink disabled:opacity-50"
            style={{ borderColor: alaris.lcdMuted }}
          />
          <Button
            size="sm"
            disabled={!canProgram || !isValidNumber}
            onClick={() => {
              if (infusion?.status === 'infusing') {
                onTitrate(order.id, parsed)
                fireConfirm(`Titrated to ${parsed}`)
              } else {
                onRequestProgram(order.id, parsed)
              }
              setDoseInput('')
            }}
          >
            {infusion?.status === 'infusing' ? 'Titrate' : 'Program'}
          </Button>
          {infusion?.status === 'infusing' && (
            <Button
              size="sm"
              variant="ghost"
              className="border"
              style={DEVICE_GHOST_STYLE}
              disabled={disabled}
              onClick={() => {
                onPause(infusion.id)
                fireConfirm('Paused')
              }}
            >
              Pause
            </Button>
          )}
          {infusion && (
            <Button
              size="sm"
              variant="ghost"
              className="border"
              style={DEVICE_GHOST_STYLE}
              disabled={disabled}
              onClick={() => {
                onDiscontinue(infusion.id)
                fireConfirm('Discontinued')
              }}
            >
              Discontinue
            </Button>
          )}
          <InlineConfirm trigger={confirmTick} message={confirmMessage} />
        </div>
      )}
    </div>
  )
}

function PausedNotice({ clockMinutes, stoppedAtMinute }: { clockMinutes: number; stoppedAtMinute: number }) {
  const elapsed = minutesStopped(clockMinutes, stoppedAtMinute)
  const overdue = isPastRemovalThreshold(clockMinutes, stoppedAtMinute)
  return (
    <div
      className="mt-2 rounded-sm px-2 py-1 text-xs font-semibold"
      style={{ backgroundColor: overdue ? alaris.hardLimit : 'transparent', color: overdue ? '#fff' : alaris.lcdMuted }}
    >
      {overdue
        ? `Paused ${elapsed} min — past 2 hr: remove from pump, disconnect, discard, notify provider.`
        : `Paused ${elapsed} min ago.`}
    </div>
  )
}

function ChannelBadge({ channel }: { channel: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-bold text-white"
      style={{ backgroundColor: alaris.chassisDark }}
    >
      CHANNEL {channel}
    </span>
  )
}

function StatusBadge({ status }: { status: { text: string; tone: ChannelTone } }) {
  const color =
    status.tone === 'active'
      ? alaris.activeGreen
      : status.tone === 'stopped'
        ? alaris.hardLimit
        : status.tone === 'locked'
          ? alaris.lcdMuted
          : alaris.softLimit
  return (
    <span className="rounded px-2 py-0.5 text-[0.65rem] font-bold text-white" style={{ backgroundColor: color }}>
      {status.text}
    </span>
  )
}
