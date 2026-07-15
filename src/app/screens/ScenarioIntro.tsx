import { useState } from 'react'
import { Button, Panel, Toast } from '../../design/primitives'
import { useSimStore } from '../../state/store'
import { SCENARIOS } from '../../data/scenarios'
import type { ScenarioConfig, SimMode } from '../../state/types'

const SCENARIO_POOL = Object.values(SCENARIOS)

function pickRandomScenario(): ScenarioConfig {
  return SCENARIO_POOL[Math.floor(Math.random() * SCENARIO_POOL.length)]
}

const MODE_COPY: Record<SimMode, { label: string; description: string }> = {
  training: {
    label: 'Training',
    description: 'Real-time coaching — an off-order dose pauses for a confirm/override decision.',
  },
  validation: {
    label: 'Validation',
    description: 'No real-time coaching — off-order doses apply silently and are scored at debrief.',
  },
}

/** Scenario briefing, drawn from the real scenario config. "Begin simulation" (re)initializes the store. */
export function ScenarioIntro() {
  const startScenario = useSimStore((s) => s.startScenario)
  const setPhase = useSimStore((s) => s.setPhase)
  // Picked once per mount (not on every render) — re-rolling on a mode toggle click
  // would silently swap the briefed scenario out from under the learner.
  const [scenario] = useState(pickRandomScenario)
  const { patient, admissionReason, orders, objective } = scenario
  const primaryTarget = orders.find((o) => o.sequence === 1)?.target
  const [mode, setMode] = useState<SimMode>('training')

  const handleBegin = () => {
    startScenario(scenario, mode)
    setPhase('sim')
  }

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <p className="text-sm font-semibold tracking-wide text-cardinal uppercase">Scenario intro</p>
        <h1 className="mt-1 text-3xl font-bold text-ink">Welcome to the simulation</h1>
        <p className="mt-2 max-w-2xl text-lg text-muted">
          You'll initiate and titrate vasoactive infusions exactly as ordered, document per policy,
          and get coached along the way. Take your time — this is a safe place to practice.
        </p>
      </div>

      <Panel title="Patient briefing">
        <dl className="grid gap-4 sm:grid-cols-3">
          {[
            ['Patient', `${patient.ageYears} ${patient.sex === 'female' ? 'F' : 'M'} · ${patient.weightKg} kg`],
            ['Admission', admissionReason],
            ['Goal', primaryTarget ? `${primaryTarget.metric} ${primaryTarget.comparator} ${primaryTarget.value} ${primaryTarget.unit}` : '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
              <dd className="mt-1 text-base font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 border-t border-border pt-4">
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Objective</dt>
          <dd className="mt-1 text-base font-medium text-ink">{objective}</dd>
        </div>
      </Panel>

      <Toast tone="info" title="How this works">
        Open any resource at any time. Every action is checked against the order and CP 4-156 — you'll
        see guidance inline, not a wall of red.
      </Toast>

      <Panel title="Session mode">
        <div className="flex flex-col gap-3 sm:flex-row">
          {(Object.keys(MODE_COPY) as SimMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`flex-1 rounded-md border px-4 py-3 text-left transition-colors ${
                mode === m ? 'border-cardinal bg-cardinal/6' : 'border-border bg-surface hover:bg-cardinal/4'
              }`}
            >
              <span className="text-base font-semibold text-ink">{MODE_COPY[m].label}</span>
              <p className="mt-1 text-sm text-muted">{MODE_COPY[m].description}</p>
            </button>
          ))}
        </div>
      </Panel>

      <div>
        <Button size="lg" onClick={handleBegin}>
          Begin simulation
        </Button>
      </div>
    </div>
  )
}
