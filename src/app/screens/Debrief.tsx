import { Button, Panel, Toast } from '../../design/primitives'
import { useSimStore } from '../../state/store'
import { useSkillTrackingStore } from '../../state/skillTrackingStore'
import { resolveDecisionPoint } from '../../engine/decisionPoints'
import { scoreSession, type ScoreStatus } from '../../engine/scoring'
import type { AttemptRecord } from '../../engine/skillAttempt'
import { SKILL_SIGNOFF_CRITERIA } from '../../data/policy'
import { DocumentationReview } from '../../devices'
import { SkillAttemptPanel } from '../SkillAttemptPanel'
import type { DecisionTone, LogEntry, Order, ScenarioConfig } from '../../state/types'

const STATUS_STYLE: Record<ScoreStatus, { label: string; className: string }> = {
  met: { label: 'Met', className: 'bg-success/12 text-success' },
  partial: { label: 'Partial', className: 'bg-gold-soft text-cardinal-dark' },
  missed: { label: 'Missed', className: 'bg-danger/12 text-danger' },
  'n/a': { label: 'N/A', className: 'bg-border/60 text-muted' },
}

const TONE_STYLE: Record<DecisionTone, { label: string; className: string }> = {
  good: { label: 'Good call', className: 'bg-success/12 text-success' },
  caution: { label: 'Worth reconsidering', className: 'bg-gold-soft text-cardinal-dark' },
  critical: { label: 'Outside your orders', className: 'bg-danger/12 text-danger' },
}

/**
 * The scorecard, Cerner-style documentation review, and coaching summary (BUILD_BRIEF
 * §9.6 / CLINICAL_SPEC.md #11), computed by engine/scoring.ts from this session's log.
 * Non-punitive by design (CLAUDE.md): strengths surface before opportunities, and
 * opportunities are specific and policy-cited rather than a wall of red.
 */
export function Debrief() {
  const setPhase = useSimStore((s) => s.setPhase)
  const scenario = useSimStore((s) => s.scenario)
  const orders = useSimStore((s) => s.orders)
  const infusions = useSimStore((s) => s.infusions)
  const log = useSimStore((s) => s.log)
  const verificationFlags = useSimStore((s) => s.verificationFlags)
  const independentCheckFlags = useSimStore((s) => s.independentCheckFlags)
  const adherenceFlags = useSimStore((s) => s.adherenceFlags)
  const blockOfChartingHistory = useSimStore((s) => s.blockOfChartingHistory)

  const card = scoreSession({ orders, infusions, log, verificationFlags, independentCheckFlags, adherenceFlags, blockOfChartingHistory })
  const decisionEntries = log.filter((e) => e.decisionPointId != null)

  const skillAttempts = useSkillTrackingStore((s) => s.skillAttempts)
  const lastAttempt = skillAttempts[skillAttempts.length - 1] ?? null

  const handleRestart = () => {
    // ScenarioIntro owns its own random scenario pick (see that file) and calls
    // startScenario itself once the learner clicks "Begin simulation" again.
    setPhase('intro')
  }

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <p className="text-sm font-semibold tracking-wide text-cardinal uppercase">Debrief</p>
        <h1 className="mt-1 text-3xl font-bold text-ink">Nice work — let's review</h1>
        <p className="mt-2 max-w-2xl text-lg text-muted">
          Your scorecard and coaching summary, grounded in the order and CP 4-156.
        </p>
      </div>

      {lastAttempt && <SkillAttemptBanner attempt={lastAttempt} />}

      <Panel
        title="Scorecard"
        subtitle={
          card.overallPercent == null
            ? 'No actions were taken this session.'
            : `${card.overallPercent}% of applicable checks met`
        }
      >
        <ul className="flex flex-col gap-3">
          {card.categories.map((category) => {
            const style = STATUS_STYLE[category.status]
            return (
              <li key={category.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-base text-ink">{category.label}</span>
                  <span className={`rounded-pill px-3 py-0.5 text-sm font-semibold ${style.className}`}>
                    {style.label}
                  </span>
                </div>
                <p className="text-sm text-muted">{category.detail}</p>
              </li>
            )
          })}
        </ul>
      </Panel>

      <Panel title="Coaching summary" subtitle="What went well, then where to focus next">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold text-success">What went well</h3>
            {card.strengths.length === 0 ? (
              <p className="mt-1 text-sm text-muted">Nothing to highlight yet — take an action to get started.</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {card.strengths.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-sm text-ink">
                    <span aria-hidden="true" className="mt-0.5 text-success">
                      ✓
                    </span>
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-cardinal-dark">Opportunities to grow</h3>
            {card.opportunities.length === 0 ? (
              <p className="mt-1 text-sm text-muted">No opportunities flagged — everything applicable was met.</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {card.opportunities.map((o) => (
                  <li key={o} className="flex items-start gap-2 text-sm text-ink">
                    <span aria-hidden="true" className="mt-0.5 text-cardinal-dark">
                      !
                    </span>
                    {o}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Panel>

      {card.coachingNotes.length > 0 && (
        <Panel title="Coaching notes" subtitle="Self-corrected in the moment — these don't affect your score">
          <ul className="flex flex-col gap-1">
            {card.coachingNotes.map((note) => (
              <li key={note} className="flex items-start gap-2 text-sm text-ink">
                <span aria-hidden="true" className="mt-0.5 text-info">
                  ℹ
                </span>
                {note}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {decisionEntries.length > 0 && (
        <Panel
          title="Decision review"
          subtitle="Every 'what's your next move' decision this session, reviewed together — validation mode withholds this live, so this may be the first time you're seeing the reasoning."
        >
          <ul className="flex flex-col gap-4">
            {decisionEntries.map((entry) => (
              <DecisionReviewRow key={entry.id} entry={entry} scenario={scenario} orders={orders} />
            ))}
          </ul>
        </Panel>
      )}

      <DocumentationReview log={log} />

      <SkillAttemptPanel record={lastAttempt} />

      <div>
        <Button variant="secondary" onClick={handleRestart}>
          Restart simulation
        </Button>
      </div>
    </div>
  )
}

/**
 * Skill sign-off outcome for this debrief's just-recorded attempt (Phase 15) — reads
 * the already-built AttemptRecord (see Simulation.tsx's recordThisAttempt), no
 * re-derivation needed. Non-punitive framing for a non-pass: names the specific gap
 * against the threshold and points at the Coaching Summary below, rather than a bare
 * "failed."
 */
function SkillAttemptBanner({ attempt }: { attempt: AttemptRecord }) {
  if (attempt.mode !== 'validation') {
    return (
      <Toast tone="info" title="Training run">
        This attempt doesn't count toward the skill sign-off requirement. Switch to Validation mode on
        the intro screen to attempt it.
      </Toast>
    )
  }
  if (attempt.passed) {
    return (
      <Toast tone="success" title="Validation passed">
        The skill sign-off requirement is met — see "Save this attempt" below to keep a record.
      </Toast>
    )
  }
  return (
    <Toast tone="warning" title="Validation attempt did not pass">
      {`Scored ${attempt.overallPercent ?? '—'}% — meeting the requirement needs at least ` +
        `${SKILL_SIGNOFF_CRITERIA.minOverallPercent}% with no category scored "missed." Review the ` +
        'opportunities below and try another validation run when ready.'}
    </Toast>
  )
}

/**
 * One resolved "what's your next move" decision, reviewed at debrief (Phase 18) —
 * re-resolves the DecisionPoint/DecisionOption from the entry's stored ids (via the
 * same resolveDecisionPoint used live) rather than duplicating their situation/feedback
 * text onto the LogEntry itself, so this can never drift from what was actually shown.
 * Falls back to the entry's own summary if the scenario's decision-point data can't be
 * resolved (e.g. a saved session viewed after scenario data changed).
 */
function DecisionReviewRow({ entry, scenario, orders }: { entry: LogEntry; scenario: ScenarioConfig; orders: Order[] }) {
  const dp = entry.decisionPointId ? resolveDecisionPoint(scenario.decisionPoints ?? [], orders, entry.decisionPointId) : null
  const option = dp?.options.find((o) => o.id === entry.decisionOptionId)
  const tone = entry.decisionTone
  const style = tone ? TONE_STYLE[tone] : null

  return (
    <li className="flex flex-col gap-1 border-b border-border pb-4 last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-ink">{dp?.situation ?? entry.summary}</span>
        {style && (
          <span className={`rounded-pill px-3 py-0.5 text-sm font-semibold whitespace-nowrap ${style.className}`}>
            {style.label}
          </span>
        )}
      </div>
      <p className="text-sm text-ink">
        Chosen: <span className="font-medium">{option?.label ?? entry.decisionOptionId}</span>
      </p>
      {option && <p className="text-sm text-muted">{option.feedback.text}</p>}
    </li>
  )
}
