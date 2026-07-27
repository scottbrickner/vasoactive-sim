import { useState, type ReactNode } from 'react'
import { Button, Panel } from '../../design/primitives'
import { useSimStore } from '../../state/store'
import { SCENARIOS } from '../../data/scenarios'
import { getDrug } from '../../data/formulary'

/**
 * Shared facilitator content: scenario picker, live read-only mirror of the learner's
 * screen, and the action feed. Used by BOTH tiers (FacilitatorBasic and Facilitator) —
 * only the chrome around it differs (passcode unlock vs. override controls). No live
 * score here, by design (CLAUDE.md's non-punitive framing keeps `overallPercent`
 * debrief-only, never surfaced live to anyone).
 */
export function FacilitatorConsole({ children }: { children?: ReactNode }) {
  const scenario = useSimStore((s) => s.scenario)
  const phase = useSimStore((s) => s.phase)
  const clockMinutes = useSimStore((s) => s.clockMinutes)
  const vitals = useSimStore((s) => s.vitals)
  const infusions = useSimStore((s) => s.infusions)
  const log = useSimStore((s) => s.log)
  const proctor = useSimStore((s) => s.proctor)
  const startScenario = useSimStore((s) => s.startScenario)
  const setPhase = useSimStore((s) => s.setPhase)

  // Clicking a scenario card only selects a candidate — it doesn't touch the shared
  // store (and therefore doesn't move the learner window) until the facilitator
  // explicitly clicks "Start session for learner" below. Previously one click did
  // both at once, with no confirmation step and no visible sign of what just happened
  // on the learner's screen.
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)
  const sentToLearner = phase !== 'intro' && selectedScenarioId != null && scenario.id === selectedScenarioId

  function startSelectedScenario() {
    const picked = selectedScenarioId ? SCENARIOS[selectedScenarioId] : null
    if (!picked) return
    // Skips ScenarioIntro's own independent random pick entirely — the facilitator has
    // effectively already briefed by choosing here, so the learner window goes
    // straight to the bedside workspace with the picked scenario.
    startScenario(picked, 'training')
    setPhase('sim')
  }

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <h1 className="text-2xl font-bold text-ink">Session console</h1>
        {proctor && (
          <p className="mt-1 text-sm text-muted">
            Proctor: {proctor.name} ({proctor.email}) · started {new Date(proctor.recordedAt).toLocaleTimeString()}
          </p>
        )}
      </div>

      <Panel title="Scenario">
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.values(SCENARIOS).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedScenarioId(s.id)}
              aria-pressed={selectedScenarioId === s.id}
              className={`rounded-md border px-4 py-3 text-left transition-colors ${
                selectedScenarioId === s.id
                  ? 'border-cardinal bg-cardinal/6'
                  : 'border-border bg-surface hover:bg-cardinal/4'
              }`}
            >
              <span className="text-base font-semibold text-ink">
                {s.patient.ageYears}
                {s.patient.sex === 'female' ? 'F' : 'M'} · {s.admissionReason}
              </span>
              <p className="mt-1 text-sm text-muted">{s.objective}</p>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button disabled={!selectedScenarioId} onClick={startSelectedScenario}>
            Start session for learner
          </Button>
          <Button variant="secondary" onClick={() => setPhase('intro')}>
            Reset to intro
          </Button>
          {sentToLearner && <span className="text-sm font-medium text-success">Learner is on this scenario now.</span>}
        </div>
      </Panel>

      <Panel title="Live mirror" subtitle={`Phase: ${phase} · Sim time: ${clockMinutes} min`}>
        <dl className="grid gap-4 sm:grid-cols-4">
          {(
            [
              ['MAP', `${vitals.map} mmHg`],
              ['HR', `${vitals.hr} bpm`],
              ['BP', `${vitals.sbp}/${vitals.dbp}`],
              ['SpO2', `${vitals.spo2}%`],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
              <dd className="mt-1 text-lg font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-col gap-2">
          {infusions.length === 0 && <p className="text-sm text-muted">No infusions yet.</p>}
          {infusions.map((i) => {
            const drug = getDrug(i.drugId)
            return (
              <div
                key={i.id}
                className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <span className="font-medium text-ink">
                  Channel {i.channel} · {drug.name}
                </span>
                <span className="text-muted">
                  {i.rate} {drug.unit} · {i.status}
                </span>
              </div>
            )
          })}
        </div>
      </Panel>

      {children}

      <Panel title="Action feed">
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {log.length === 0 && <p className="text-sm text-muted">No actions yet.</p>}
          {[...log].reverse().map((entry) => (
            <li key={entry.id} className="text-sm">
              <span className="font-mono text-muted">{String(entry.minute).padStart(3, '0')}m</span>{' '}
              <span className="text-ink">{entry.summary}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
