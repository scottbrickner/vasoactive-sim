import { useState } from 'react'
import { Button, Field, Panel } from '../../design/primitives'
import { useSimStore } from '../../state/store'
import { getDrug } from '../../data/formulary'
import type { DrugId } from '../../state/types'

const VITAL_FIELDS = [
  { key: 'hr' as const, label: 'HR', unit: 'bpm', min: 30, max: 220 },
  { key: 'sbp' as const, label: 'SBP', unit: 'mmHg', min: 40, max: 260 },
  { key: 'dbp' as const, label: 'DBP', unit: 'mmHg', min: 20, max: 160 },
  { key: 'spo2' as const, label: 'SpO2', unit: '%', min: 50, max: 100 },
]

/**
 * Educator-tier-only live override controls (Phase 10): vital-sign sliders (HR, ART's
 * two components, SpO2 — MAP deliberately excluded, see store.ts's doc comment),
 * per-drug response-model overrides, blunt force-improve/worsen buttons, and live
 * order editing. Every commit here writes straight to the (synced) store, so it's
 * visible on the learner's screen immediately.
 */
export function OverrideControls() {
  const vitals = useSimStore((s) => s.vitals)
  const vitalOverrides = useSimStore((s) => s.vitalOverrides)
  const commitVitalOverride = useSimStore((s) => s.commitVitalOverride)
  const clearVitalOverride = useSimStore((s) => s.clearVitalOverride)
  const responseModelOverrides = useSimStore((s) => s.responseModelOverrides)
  const setResponseModelOverride = useSimStore((s) => s.setResponseModelOverride)
  const clearResponseModelOverride = useSimStore((s) => s.clearResponseModelOverride)
  const forceImprove = useSimStore((s) => s.forceImprove)
  const forceWorsen = useSimStore((s) => s.forceWorsen)
  const orders = useSimStore((s) => s.orders)
  const updateOrder = useSimStore((s) => s.updateOrder)
  const scenario = useSimStore((s) => s.scenario)

  // Local draft values — the slider previews here without touching the store; only
  // "Apply" commits (see FacilitatorConsole's doc comment on this pattern).
  const [drafts, setDrafts] = useState<Record<string, number>>({})

  function draftFor(key: string, fallback: number): number {
    return drafts[key] ?? fallback
  }

  return (
    <Panel title="Live overrides" subtitle="Educator tier — changes apply to the learner's screen immediately.">
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="text-sm font-semibold text-ink">Vital signs</h3>
          <p className="mt-1 text-sm text-muted">
            MAP isn't independently adjustable here — it's derived from titration and deterioration
            elsewhere in the engine.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {VITAL_FIELDS.map(({ key, label, unit, min, max }) => {
              const current = vitals[key]
              const overridden = vitalOverrides[key] != null
              const draft = draftFor(key, current)
              return (
                <div key={key} className="rounded-md border border-border bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">
                      {label} {overridden && <span className="text-cardinal">(overridden)</span>}
                    </span>
                    <span className="font-mono text-sm text-muted">
                      {draft} {unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [key]: Number(e.target.value) }))}
                    className="mt-2 w-full"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => commitVitalOverride(key, draft)}>
                      Apply
                    </Button>
                    {overridden && (
                      <Button size="sm" variant="ghost" onClick={() => clearVitalOverride(key)}>
                        Clear override
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink">Response model</h3>
          <p className="mt-1 text-sm text-muted">
            Override a drug's MAP-response ceiling for the rest of the session.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {(Object.keys(scenario.responseModel) as DrugId[]).map((drugId) => {
              const drug = getDrug(drugId)
              const scenarioDefault = scenario.responseModel[drugId]?.maxMapContribution ?? 0
              const overrideKey = `rm-${drugId}`
              const overridden = responseModelOverrides[drugId] != null
              const draft = draftFor(overrideKey, responseModelOverrides[drugId] ?? scenarioDefault)
              return (
                <div key={drugId} className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
                  <span className="flex-1 text-sm font-medium text-ink">
                    {drug.name} {overridden && <span className="text-cardinal">(overridden)</span>}
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [overrideKey]: Number(e.target.value) }))}
                    className="h-8 w-20 rounded border border-border bg-white px-2 text-sm"
                  />
                  <span className="text-xs text-muted">mmHg at max</span>
                  <Button size="sm" variant="secondary" onClick={() => setResponseModelOverride(drugId, draft)}>
                    Apply
                  </Button>
                  {overridden && (
                    <Button size="sm" variant="ghost" onClick={() => clearResponseModelOverride(drugId)}>
                      Clear
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink">Deterioration</h3>
          <p className="mt-1 text-sm text-muted">Immediate, blunt nudges to MAP — not a gradual physiology change.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => forceImprove(5)}>
              Force improve (+5 mmHg)
            </Button>
            <Button size="sm" variant="secondary" onClick={() => forceWorsen(5)}>
              Force worsen (−5 mmHg)
            </Button>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink">Orders</h3>
          <p className="mt-1 text-sm text-muted">Live-edit an in-progress order's parameters.</p>
          <div className="mt-3 flex flex-col gap-3">
            {orders.map((order) => {
              const drug = getDrug(order.drugId)
              return (
                <div key={order.id} className="rounded-md border border-border bg-surface p-3">
                  <p className="text-sm font-semibold text-ink">{drug.name}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Field
                      label="Max dose"
                      type="number"
                      defaultValue={order.maxDose}
                      onBlur={(e) => {
                        const value = Number(e.target.value)
                        if (value !== order.maxDose) updateOrder(order.id, { maxDose: value })
                      }}
                    />
                    <Field
                      label="Increment"
                      type="number"
                      defaultValue={order.increment}
                      onBlur={(e) => {
                        const value = Number(e.target.value)
                        if (value !== order.increment) updateOrder(order.id, { increment: value })
                      }}
                    />
                    <Field
                      label="Min interval"
                      type="number"
                      defaultValue={order.interval.minMinutes}
                      onBlur={(e) => {
                        const value = Number(e.target.value)
                        if (value !== order.interval.minMinutes) updateOrder(order.id, { intervalMinMinutes: value })
                      }}
                    />
                    <Field
                      label="Target value"
                      type="number"
                      defaultValue={order.target.value}
                      onBlur={(e) => {
                        const value = Number(e.target.value)
                        if (value !== order.target.value) updateOrder(order.id, { targetValue: value })
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Panel>
  )
}
