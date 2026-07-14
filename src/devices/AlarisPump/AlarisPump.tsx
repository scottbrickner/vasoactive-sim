import { useState } from 'react'
import { alaris } from '../../design/deviceTokens'
import { Button } from '../../design/primitives'
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
  onRequestProgram: (orderId: string, dose: number) => void
  /** True while a verification confirmation is pending elsewhere on the page. */
  disabled?: boolean
}

/**
 * Faithful (not stylized) replica of an Alaris Model 8015 / Guardrails Suite MX channel
 * screen. The learner enters their OWN dose (CLINICAL_SPEC.md #6 — free-choice dosing;
 * the sim never pre-fills or hints the correct value) and requests programming; the
 * actual Guardrails/order evaluation happens in the store after the verification gate.
 */
export function AlarisPump({ channels, onRequestProgram, disabled }: AlarisPumpProps) {
  return (
    <div className="flex flex-col gap-3">
      {channels.map((info) => (
        <PumpChannel key={info.order.id} info={info} onRequestProgram={onRequestProgram} disabled={disabled} />
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
  if (info.infusion.status === 'stopped') return { text: 'STOPPED', tone: 'stopped' }
  return { text: 'READY TO PROGRAM', tone: 'idle' }
}

interface PumpChannelProps {
  info: PumpChannelInfo
  onRequestProgram: (orderId: string, dose: number) => void
  disabled?: boolean
}

function PumpChannel({ info, onRequestProgram, disabled }: PumpChannelProps) {
  const { order, drug, infusion, isActivated } = info
  const status = channelStatus(info)
  const [doseInput, setDoseInput] = useState('')

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

  const canProgram = (!infusion || infusion.beginBagCompleted) && !disabled
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
      </div>

      <div className="mt-3 flex items-center gap-2">
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
            onRequestProgram(order.id, parsed)
            setDoseInput('')
          }}
        >
          {infusion?.status === 'infusing' ? 'Titrate' : 'Program'}
        </Button>
      </div>
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
