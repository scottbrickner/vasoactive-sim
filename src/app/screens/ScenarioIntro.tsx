import { Button, Panel, Toast } from '../../design/primitives'
import { useShellStore } from '../../state/store'

/** Phase 1 placeholder for the Scenario Intro. Real patient/order briefing arrives in later phases. */
export function ScenarioIntro() {
  const setPhase = useShellStore((s) => s.setPhase)
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

      <Panel
        title="Patient briefing"
        subtitle="Placeholder — scenario data is authored in Phase 2"
      >
        <dl className="grid gap-4 sm:grid-cols-3">
          {[
            ['Patient', '55 F · 68 kg'],
            ['Admission', 'Neutropenic septic shock'],
            ['Goal', 'MAP ≥ 65 mmHg'],
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
        <Button size="lg" onClick={() => setPhase('sim')}>
          Begin simulation
        </Button>
      </div>
    </div>
  )
}
