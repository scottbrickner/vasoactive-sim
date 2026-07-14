import { Button, Panel, Toast } from '../../design/primitives'
import { useSimStore } from '../../state/store'
import { DEFAULT_SCENARIO } from '../../data/scenarios'

/** Scenario briefing, drawn from the real scenario config. "Begin simulation" (re)initializes the store. */
export function ScenarioIntro() {
  const startScenario = useSimStore((s) => s.startScenario)
  const setPhase = useSimStore((s) => s.setPhase)
  const { patient, admissionReason, orders } = DEFAULT_SCENARIO
  const primaryTarget = orders.find((o) => o.sequence === 1)?.target

  const handleBegin = () => {
    startScenario(DEFAULT_SCENARIO)
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
      </Panel>

      <Toast tone="info" title="How this works">
        Open any resource at any time. Every action is checked against the order and CP 4-156 — you'll
        see guidance inline, not a wall of red.
      </Toast>

      <div>
        <Button size="lg" onClick={handleBegin}>
          Begin simulation
        </Button>
      </div>
    </div>
  )
}
