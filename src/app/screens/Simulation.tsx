import { Button, Panel } from '../../design/primitives'
import { useShellStore } from '../../state/store'

/**
 * Phase 1 placeholder for the Simulation workspace. The faithful device replicas
 * (Philips monitor, Alaris pump, Cerner MAR/iView, Orders, Infusions) are built in Phase 3+.
 */
export function Simulation() {
  const setPhase = useShellStore((s) => s.setPhase)
  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <p className="text-sm font-semibold tracking-wide text-cardinal uppercase">Simulation</p>
        <h1 className="mt-1 text-3xl font-bold text-ink">Bedside workspace</h1>
        <p className="mt-2 max-w-2xl text-lg text-muted">
          The device screens will live here — a faithful register, deliberately separate from this
          friendly shell.
        </p>
      </div>

      <div className="grid gap-gutter sm:grid-cols-2 lg:grid-cols-3">
        {[
          'Philips IntelliVue monitor',
          'Alaris pump · Guardrails',
          'Cerner MAR · Begin Bag',
          'Cerner iView flowsheet',
          'Orders profile',
          'Current infusions',
        ].map((name) => (
          <Panel key={name} className="min-h-28">
            <p className="text-sm font-semibold text-ink">{name}</p>
            <p className="mt-1 text-sm text-muted">Device replica — Phase 3+</p>
          </Panel>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={() => setPhase('intro')}>
          Back to intro
        </Button>
        <Button onClick={() => setPhase('debrief')}>End &amp; go to debrief</Button>
      </div>
    </div>
  )
}
