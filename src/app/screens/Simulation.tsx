import { Button } from '../../design/primitives'
import { useShellStore } from '../../state/store'
import { DEFAULT_SCENARIO } from '../../data/scenarios'
import { AlarisPump, CernerIView, CernerMAR, InfusionsPanel, OrdersProfile, PhilipsMonitor } from '../../devices'

/**
 * Bedside workspace. Phase 3: the device screens render statically from the scenario
 * config — faithful replicas, no interactions yet. The engine that lets the learner act
 * on them (dose entry, Guardrails checks, documentation) is Phase 4/5.
 */
export function Simulation() {
  const setPhase = useShellStore((s) => s.setPhase)
  const scenario = DEFAULT_SCENARIO
  const infusions = [scenario.initialInfusion]

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <p className="text-sm font-semibold tracking-wide text-cardinal uppercase">Simulation</p>
        <h1 className="mt-1 text-3xl font-bold text-ink">Bedside workspace</h1>
        <p className="mt-2 max-w-2xl text-lg text-muted">
          Faithful device replicas — deliberately separate from the branded shell around them.
        </p>
      </div>

      <PhilipsMonitor vitals={scenario.startingVitals} />

      <div className="grid gap-gutter lg:grid-cols-2">
        <div className="flex flex-col gap-gutter">
          <AlarisPump infusions={infusions} orders={scenario.orders} />
          <InfusionsPanel infusions={infusions} />
        </div>
        <div className="flex flex-col gap-gutter">
          <OrdersProfile orders={scenario.orders} />
          <CernerMAR infusions={infusions} orders={scenario.orders} />
          <CernerIView />
        </div>
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
