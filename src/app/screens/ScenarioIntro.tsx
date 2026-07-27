import { useState } from 'react'
import { Button, Field, Panel, Toast } from '../../design/primitives'
import { useSimStore } from '../../state/store'
import { useSkillTrackingStore } from '../../state/skillTrackingStore'
import { isValidInstitutionalEmail } from '../../lib/learnerIdentity'
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

  const learnerIdentity = useSkillTrackingStore((s) => s.learnerIdentity)
  const setLearnerIdentity = useSkillTrackingStore((s) => s.setLearnerIdentity)
  const [learnerName, setLearnerName] = useState(learnerIdentity?.name ?? '')
  const [learnerEmail, setLearnerEmail] = useState(learnerIdentity?.email ?? '')
  const emailTouched = learnerEmail.trim().length > 0
  const emailValid = isValidInstitutionalEmail(learnerEmail)
  const identityOk = learnerName.trim().length > 0 && emailValid
  const beginDisabled = mode === 'validation' && !identityOk

  const handleBegin = () => {
    if (learnerName.trim() || learnerEmail.trim()) {
      setLearnerIdentity({ name: learnerName.trim(), email: learnerEmail.trim() })
    }
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
        see guidance inline, not a wall of red. BCMA/I-TRACE verification happens once, when you enter
        the starting dose — Begin Bag itself doesn't gate you again. Time auto-advances by the order's
        own interval after you start a dose and after each titration; the manual "+3/+5/+30 min"
        buttons are only for waiting longer or catching up on charting. If you keep titrating without
        reaching target, you'll get an offer to fast-forward the routine climb. Check Charting Status
        any time to see what's charted/verified and what's still due before you end the session.
      </Toast>

      <Panel title="Learner identity">
        <p className="text-sm text-muted">
          Required to begin a Validation-mode run; optional for Training. Saved on this browser and
          reused next time.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            value={learnerName}
            onChange={(e) => setLearnerName(e.target.value)}
            placeholder="Jane Doe"
          />
          <Field
            label="Institutional email"
            type="email"
            value={learnerEmail}
            onChange={(e) => setLearnerEmail(e.target.value)}
            placeholder="you@med.usc.edu"
            error={emailTouched && !emailValid ? 'Must be an institutional email (ends in @med.usc.edu).' : undefined}
          />
        </div>
      </Panel>

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
        <Button size="lg" onClick={handleBegin} disabled={beginDisabled}>
          Begin simulation
        </Button>
        {beginDisabled && (
          <p className="mt-2 text-sm text-muted">
            Enter your name and institutional email above to begin a Validation-mode run.
          </p>
        )}
      </div>
    </div>
  )
}
