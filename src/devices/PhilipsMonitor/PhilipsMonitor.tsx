import { philips } from '../../design/deviceTokens'
import type { VitalSigns } from '../../state/types'

export interface PhilipsMonitorProps {
  vitals: VitalSigns
}

/**
 * Faithful (not stylized) replica of a Philips IntelliVue bedside monitor.
 * Static for Phase 3 — the waveforms are decorative, not physiology-driven
 * (that's the physiology engine, Phase 4+).
 */
export function PhilipsMonitor({ vitals }: PhilipsMonitorProps) {
  return (
    <div
      className="overflow-hidden rounded-md border"
      style={{ backgroundColor: philips.background, borderColor: philips.panelBorder }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-2 text-xs"
        style={{ borderColor: philips.panelBorder, color: philips.label }}
      >
        <span className="font-mono tracking-wide">PHILIPS IntelliVue · Bed 04</span>
        <span className="font-mono">{vitals.rhythm.toUpperCase()}</span>
      </div>

      <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0" style={{ borderColor: philips.panelBorder }}>
        <VitalTile label="HR" value={vitals.hr} unit="bpm" color={philips.ecgGreen} waveform="ecg" />
        <VitalTile
          label="ABP"
          value={`${vitals.sbp}/${vitals.dbp}`}
          sub={`(${vitals.map})`}
          unit="mmHg"
          color={philips.abpRed}
          waveform="art"
        />
        <VitalTile label="SpO2" value={vitals.spo2} unit="%" color={philips.spo2Cyan} />
      </div>
    </div>
  )
}

interface VitalTileProps {
  label: string
  value: string | number
  sub?: string
  unit: string
  color: string
  waveform?: 'ecg' | 'art'
}

function VitalTile({ label, value, sub, unit, color, waveform }: VitalTileProps) {
  return (
    <div className="px-4 py-3" style={{ borderColor: philips.panelBorder }}>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs" style={{ color: philips.label }}>
          {label}
        </span>
        <span className="font-mono text-[0.65rem]" style={{ color: philips.label }}>
          {unit}
        </span>
      </div>
      <div className="mt-1 font-mono text-4xl font-bold tabular-nums" style={{ color }}>
        {value}
        {sub && <span className="ml-1 text-lg font-normal">{sub}</span>}
      </div>
      {waveform && <Waveform color={color} kind={waveform} />}
    </div>
  )
}

/** Decorative static trace — NOT derived from real waveform data. */
function Waveform({ color, kind }: { color: string; kind: 'ecg' | 'art' }) {
  const path =
    kind === 'ecg'
      ? 'M0,10 L8,10 L11,10 L13,2 L15,18 L17,4 L19,10 L26,10 L34,10 L37,10 L39,2 L41,18 L43,4 L45,10 L52,10 L60,10'
      : 'M0,12 C6,4 10,2 14,6 C18,10 20,14 24,10 C28,6 32,4 36,8 C40,12 44,14 48,10 C52,6 56,4 60,8'
  return (
    <svg aria-hidden="true" viewBox="0 0 60 20" className="mt-2 h-6 w-full" preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth="1" opacity={0.8} />
    </svg>
  )
}
