import { useState } from 'react'
import { alaris } from '../../design/deviceTokens'
import { Button, InlineConfirm } from '../../design/primitives'
import { DeviceStatusBadge } from '../shared'
import { isPastRemovalThreshold, minutesStopped } from '../../engine/infusionLifecycle'
import type { PumpChannelInfo } from './AlarisPump'

/**
 * Phase 17: ghost-style device buttons (Pause/Discontinue) on the NOW-LIGHT chassis
 * (see deviceTokens.ts — real Alaris hardware is light gray plastic, not dark). This is
 * the inverse of the original dark-chassis fix: `alaris.onLightMuted`/`onLightBorder`
 * exist specifically for this light background, replacing the old near-white
 * `alaris.lcd`/`lcdMuted` pairing that would now fail WCAG AA. Inline `style` still wins
 * over the shell Button's `ghost` variant utility classes regardless of Tailwind's
 * generated CSS order.
 */
const DEVICE_GHOST_STYLE = { color: alaris.onLightMuted, borderColor: alaris.onLightBorder } as const

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

type LedName = 'ALARM' | 'INFUSE' | 'STANDBY'

/** Each LED lights for a mutually-exclusive tone so the decorative strip never implies
 *  two contradictory states at once — ALARM lights on a pause (a real pump alarms when
 *  stopped unexpectedly), INFUSE on active infusion, STANDBY while idle/locked. */
function litColorFor(led: LedName, tone: ChannelTone): string | null {
  if (led === 'INFUSE' && tone === 'active') return alaris.activeGreen
  if (led === 'ALARM' && tone === 'stopped') return alaris.hardLimit
  if (led === 'STANDBY' && (tone === 'idle' || tone === 'locked')) return alaris.softLimit
  return null
}

function toneColor(tone: ChannelTone): string {
  if (tone === 'active') return alaris.activeGreen
  if (tone === 'stopped') return alaris.hardLimit
  if (tone === 'locked') return alaris.lcdMuted
  return alaris.softLimit
}

export interface AlarisChannelModuleProps {
  info: PumpChannelInfo
  clockMinutes: number
  onRequestProgram: (orderId: string, dose: number) => void
  onTitrate: (orderId: string, dose: number) => void
  onPause: (infusionId: string) => void
  onRestart: (infusionId: string) => void
  onDiscontinue: (infusionId: string) => void
  disabled?: boolean
}

/**
 * One small-LCD "channel module" from the real ganged Alaris hardware array — see
 * AlarisPump.tsx for how several of these flank one decorative AlarisCentralModule.
 * Extracted from the pre-Phase-17 AlarisPump.tsx almost verbatim: same props, same
 * channelStatus()/interaction logic, same native `<input type=number>` + Button-based
 * controls — this phase reskins the chrome, it does not change how a learner programs
 * a dose (see AlarisCentralModule.tsx's doc comment for why the real device's physical
 * keypad stays decorative rather than becoming a second, worse input method).
 */
export function AlarisChannelModule({
  info,
  clockMinutes,
  onRequestProgram,
  onTitrate,
  onPause,
  onRestart,
  onDiscontinue,
  disabled,
}: AlarisChannelModuleProps) {
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
      <div className="rounded-lg border p-3" style={{ backgroundColor: alaris.chassisLight, borderColor: alaris.chassisLightBorder }}>
        <ChannelHeader channel={info.channel} status={status} />
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
    <div className="rounded-lg border p-3" style={{ backgroundColor: alaris.chassisLight, borderColor: alaris.chassisLightBorder }}>
      <ChannelHeader channel={info.channel} status={status} />

      <div className="rounded-sm p-3 font-mono" style={{ backgroundColor: alaris.lcd, color: alaris.lcdInk }}>
        <div className="flex items-baseline justify-between text-sm font-semibold">
          <span>{drug.name}</span>
          <span style={{ color: alaris.lcdMuted }}>
            {drug.concentration.amount} {drug.concentration.amountUnit}/{drug.concentration.volumeMl} mL
          </span>
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-[0.6rem] tracking-wide" style={{ color: alaris.lcdMuted }}>
            RATE ({drug.unit})
          </span>
        </div>
        <div className="text-3xl font-bold tabular-nums">
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

      <p className="mt-2 text-center text-[0.6rem]" style={{ color: alaris.onLightMuted }}>
        Clear clamp before opening door
      </p>

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
            style={{ borderColor: alaris.onLightBorder }}
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

/**
 * Channel badge + a decorative 3-LED strip (ALARM/INFUSE/STANDBY) echoing the real
 * hardware's indicator row, above the accessible status badge that actually carries the
 * text-paired state (the LED strip is aria-hidden — it's a redundant visual echo, not a
 * second source of truth, matching the Philips softkey row's decorative-chrome pattern).
 */
function ChannelHeader({ channel, status }: { channel: string; status: { text: string; tone: ChannelTone } }) {
  const color = toneColor(status.tone)
  return (
    <div className="mb-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: alaris.chassisDark }}>
          CHANNEL {channel}
        </span>
        <span className="font-mono text-[0.6rem]" style={{ color: alaris.onLightMuted }}>
          CareFusion
        </span>
      </div>
      <div className="flex items-center gap-2 px-1" aria-hidden>
        {(['ALARM', 'INFUSE', 'STANDBY'] as const).map((led) => (
          <span key={led} className="flex items-center gap-1 text-[0.55rem] font-semibold" style={{ color: alaris.onLightMuted }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: litColorFor(led, status.tone) ?? alaris.chassisLightBorder }} />
            {led}
          </span>
        ))}
      </div>
      <div className="px-1">
        <DeviceStatusBadge label={status.text} backgroundColor={color} color="#ffffff" />
      </div>
    </div>
  )
}
