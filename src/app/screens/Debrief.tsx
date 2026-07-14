import { Button, Panel, Toast } from '../../design/primitives'
import { useSimStore } from '../../state/store'
import { DEFAULT_SCENARIO } from '../../data/scenarios'

/**
 * Placeholder for the Debrief. The real scorecard, Cerner-style documentation review,
 * and cited coaching summary are built in Phase 6.
 */
export function Debrief() {
  const startScenario = useSimStore((s) => s.startScenario)
  const setPhase = useSimStore((s) => s.setPhase)

  const handleRestart = () => {
    startScenario(DEFAULT_SCENARIO)
    setPhase('intro')
  }
  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <p className="text-sm font-semibold tracking-wide text-cardinal uppercase">Debrief</p>
        <h1 className="mt-1 text-3xl font-bold text-ink">Nice work — let's review</h1>
        <p className="mt-2 max-w-2xl text-lg text-muted">
          Your scorecard and coaching summary will appear here, grounded in policy and the reference
          library.
        </p>
      </div>

      <Panel title="Scorecard" subtitle="Placeholder — scoring engine arrives in Phase 6">
        <ul className="flex flex-col gap-3">
          {[
            ['Order adherence', 'success'],
            ['Titration intervals & increments', 'info'],
            ['Documentation cadence & placement', 'warning'],
          ].map(([label, tone]) => (
            <li key={label} className="flex items-center justify-between gap-4">
              <span className="text-base text-ink">{label}</span>
              <span
                className={
                  'rounded-pill px-3 py-0.5 text-sm font-semibold ' +
                  (tone === 'success'
                    ? 'bg-success/12 text-success'
                    : tone === 'warning'
                      ? 'bg-gold-soft text-cardinal-dark'
                      : 'bg-info/12 text-info')
                }
              >
                Pending
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Toast tone="success" title="Coaching preview">
        Non-punitive by design: the debrief highlights what went well first, then the specific,
        policy-cited opportunities to improve.
      </Toast>

      <div>
        <Button variant="secondary" onClick={handleRestart}>
          Restart simulation
        </Button>
      </div>
    </div>
  )
}
