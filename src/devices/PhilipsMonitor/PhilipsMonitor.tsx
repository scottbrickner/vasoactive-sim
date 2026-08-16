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
 * decorative, not derived from real waveform data. MAP/SBP/DBP/HR/SpO2 all respond to
 * titration (see ScenarioConfig.responseModel + state/store.ts's advanceClock); HR/
 * SBP/DBP additionally carry natural periodic variability layered on top of that
 * response (see engine/physiology.ts's periodicVariability) — MAP itself deliberately
 * never jitters, since clinical logic keys off its exact value. Rhythm label stays
 * frozen at the scenario's starting value — this monitor doesn't model rhythm changes.
 *
 * Phase 17: rebuilt for closer visual fidelity against a real IntelliVue MP-series unit
 * — a top bed/profile strip, stacked trace-left/number-right parameter bands (was a
 * side-by-side 3-column grid), and a bottom softkey row. Deliberately does NOT add
 * CO2/awRR/TV bands the real hardware shows, even though the reference photo has them —
 * this engine doesn't model respiratory data, and CLAUDE.md is explicit ("No
 * hard-coded clinical values in components"): a tile with a fabricated or permanently
 * blank number would be worse than not having the tile. A future respiratory-modeling
 * phase can add a fourth stacked band to this same structure without a rework. The top
 * strip's "Profile Adult"/"4 Waves" text and the bottom softkey row are device
 * *display-mode* chrome, not physiologic values, so they're safe to hardcode.
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
      <TopStrip rhythm={vitals.rhythm} />

      <div className="flex flex-col divide-y" style={{ borderColor: philips.panelBorder }}>
        <ParameterBand label="HR" value={vitals.hr} unit="bpm" color={philips.ecgGreen}>
          <Waveform kind="ecg" color={philips.ecgGreen} cycleSeconds={cycleSeconds} />
        </ParameterBand>
        <ParameterBand label="ABP" value={`${vitals.sbp}/${vitals.dbp}`} sub={`(${vitals.map})`} unit="mmHg" color={philips.abpRed}>
          <Waveform kind="art" color={philips.abpRed} cycleSeconds={cycleSeconds} amplitudeScale={abpAmplitudeScale} />
        </ParameterBand>
        <ParameterBand label="SpO2" value={vitals.spo2} unit="%" color={philips.spo2Cyan}>
          <Waveform kind="pleth" color={philips.spo2Cyan} cycleSeconds={cycleSeconds} />
        </ParameterBand>
      </div>

      <SoftkeyRow />
    </div>
  )
}

function TopStrip({ rhythm }: { rhythm: string }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-3 py-1.5 text-[0.65rem]"
      style={{ backgroundColor: philips.topStripBg, borderColor: philips.panelBorder, color: philips.label }}
    >
      {/* Decorative device chrome (bed label, profile/wave-count mode, wordmark) — an
          aria-hidden ancestor isn't reliably overridable by a descendant's aria-hidden="false"
          across assistive tech, so the one REAL piece of content here (rhythm, below) is kept
          as a sibling entirely outside this wrapper rather than nested inside it. */}
      <div className="flex items-center gap-2" aria-hidden>
        <span
          className="rounded px-1.5 py-0.5 font-mono font-bold text-white"
          style={{ backgroundColor: philips.bedTagBg }}
        >
          Bed 04
        </span>
        <span className="font-mono tracking-wide">USC Norris Cancer Hospital · Oncology ICU</span>
      </div>
      <div className="flex items-center gap-3 font-mono" aria-hidden>
        <span>Profile Adult</span>
        <span>4 Waves</span>
        <span className="font-semibold" style={{ color: philips.wordmark }}>
          IntelliVue
        </span>
      </div>
      <span className="font-mono">RHYTHM: {rhythm.toUpperCase()}</span>
    </div>
  )
}

interface ParameterBandProps {
  label: string
  value: string | number
  sub?: string
  unit: string
  color: string
  children?: ReactNode
}

function ParameterBand({ label, value, sub, unit, color, children }: ParameterBandProps) {
  return (
    <div className="flex items-stretch gap-3 px-3 py-2" style={{ borderColor: philips.panelBorder }}>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex w-32 shrink-0 flex-col items-end justify-center text-right sm:w-40">
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-xs" style={{ color: philips.label }}>
            {label}
          </span>
          <span className="font-mono text-[0.65rem]" style={{ color: philips.label }}>
            {unit}
          </span>
        </div>
        <div className="font-mono text-3xl leading-none font-bold tabular-nums sm:text-4xl" style={{ color }}>
          {value}
          {sub && <span className="ml-1 text-base font-normal">{sub}</span>}
        </div>
      </div>
    </div>
  )
}

const SOFTKEYS = [
  'Silence',
  'Alarms off',
  'Stand-by',
  'Start All',
  'Zero',
  'Recordings',
  'Vitals Recall',
  'Adult/Discharge',
  'Monitor Standby',
  'Main Setup',
  'Mute Screen',
] as const
const HIGHLIGHTED_SOFTKEYS: readonly string[] = ['Alarms off', 'Mute Screen']

/**
 * Decorative chrome only — deliberately NOT real `<button>` elements. A `<button>` that
 * does nothing on click/keypress is a WCAG focus-trap anti-pattern; rendering these as
 * `aria-hidden` spans keeps the photographic bottom-bar layout without adding dead focus
 * stops. Every REAL control in this app (Program/Titrate/Pause/Restart/Discontinue,
 * Begin Bag, Chart now, etc.) lives in the actual device components below this monitor,
 * not here — this row doesn't gate or trigger anything.
 */
function SoftkeyRow() {
  return (
    <div className="border-t px-2 py-2" style={{ borderColor: philips.panelBorder, backgroundColor: philips.softkeyBg }}>
      <div className="flex flex-wrap justify-center gap-1" aria-hidden>
        {SOFTKEYS.map((key) => {
          const active = HIGHLIGHTED_SOFTKEYS.includes(key)
          return (
            <span
              key={key}
              className="rounded-sm border px-2 py-1 text-center font-mono text-[0.6rem] leading-tight"
              style={{
                borderColor: philips.softkeyBorder,
                backgroundColor: active ? philips.softkeyActiveBg : 'transparent',
                color: active ? philips.softkeyActiveText : philips.softkeyText,
              }}
            >
              {key}
            </span>
          )
        })}
      </div>
      <div className="mt-2 text-center font-mono text-[0.65rem] font-bold tracking-[0.3em]" style={{ color: philips.wordmark }}>
        PHILIPS
      </div>
    </div>
  )
}
