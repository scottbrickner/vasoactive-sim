import type { ReactNode } from 'react'
import { philips } from '../../design/deviceTokens'
import type { VitalSigns } from '../../state/types'
import { Waveform } from './Waveform'

export interface PhilipsMonitorProps {
  vitals: VitalSigns
  /** Scenario baseline vitals — only used to scale the ABP trace's amplitude against the live pulse pressure. */
  startingVitals: VitalSigns
}

/**
 * Faithful (not stylized) replica of a Philips IntelliVue bedside monitor. Waveforms
 * are continuously animated (see Waveform.tsx) but the shapes themselves are still
 * decorative, not derived from real waveform data. MAP/SBP/DBP respond to titration;
 * HR/SBP/DBP additionally carry natural periodic variability layered on top (see
 * state/store.ts's advanceClock and engine/physiology.ts's periodicVariability) — MAP
 * itself deliberately never jitters, since clinical logic keys off its exact value.
 * SpO2/rhythm stay frozen at scenario starting values until Phase 12 makes HR/SpO2
 * actually respond to titration (a different thing from 8d's variability).
 */
export function PhilipsMonitor({ vitals, startingVitals }: PhilipsMonitorProps) {
  const cycleSeconds = 60 / vitals.hr
  const startingPulsePressure = startingVitals.sbp - startingVitals.dbp
  const livePulsePressure = vitals.sbp - vitals.dbp
  const abpAmplitudeScale = startingPulsePressure > 0 ? livePulsePressure / startingPulsePressure : 1

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
        <VitalTile label="HR" value={vitals.hr} unit="bpm" color={philips.ecgGreen}>
          <Waveform kind="ecg" color={philips.ecgGreen} cycleSeconds={cycleSeconds} />
        </VitalTile>
        <VitalTile label="ABP" value={`${vitals.sbp}/${vitals.dbp}`} sub={`(${vitals.map})`} unit="mmHg" color={philips.abpRed}>
          <Waveform kind="art" color={philips.abpRed} cycleSeconds={cycleSeconds} amplitudeScale={abpAmplitudeScale} />
        </VitalTile>
        <VitalTile label="SpO2" value={vitals.spo2} unit="%" color={philips.spo2Cyan}>
          <Waveform kind="pleth" color={philips.spo2Cyan} cycleSeconds={cycleSeconds} />
        </VitalTile>
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
  children?: ReactNode
}

function VitalTile({ label, value, sub, unit, color, children }: VitalTileProps) {
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
      {children}
    </div>
  )
}
