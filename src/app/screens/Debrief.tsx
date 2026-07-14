import { Button, Panel } from '../../design/primitives'
import { useSimStore } from '../../state/store'
import { DEFAULT_SCENARIO } from '../../data/scenarios'
import { scoreSession, type ScoreStatus } from '../../engine/scoring'
import { DocumentationReview } from '../../devices'

const STATUS_STYLE: Record<ScoreStatus, { label: string; className: string }> = {
  met: { label: 'Met', className: 'bg-success/12 text-success' },
  partial: { label: 'Partial', className: 'bg-gold-soft text-cardinal-dark' },
  missed: { label: 'Missed', className: 'bg-danger/12 text-danger' },
  'n/a': { label: 'N/A', className: 'bg-border/60 text-muted' },
}

/**
 * The scorecard, Cerner-style documentation review, and coaching summary (BUILD_BRIEF
 * §9.6 / CLINICAL_SPEC.md #11), computed by engine/scoring.ts from this session's log.
 * Non-punitive by design (CLAUDE.md): strengths surface before opportunities, and
 * opportunities are specific and policy-cited rather than a wall of red.
 */
export function Debrief() {
  const startScenario = useSimStore((s) => s.startScenario)
  const setPhase = useSimStore((s) => s.setPhase)
  const orders = useSimStore((s) => s.orders)
  const infusions = useSimStore((s) => s.infusions)
  const log = useSimStore((s) => s.log)
  const verificationFlags = useSimStore((s) => s.verificationFlags)
  const adherenceFlags = useSimStore((s) => s.adherenceFlags)
  const blockOfChartingHistory = useSimStore((s) => s.blockOfChartingHistory)

  const card = scoreSession({ orders, infusions, log, verificationFlags, adherenceFlags, blockOfChartingHistory })

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
          Your scorecard and coaching summary, grounded in the order and CP 4-156.
        </p>
      </div>

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

      <DocumentationReview log={log} />

      <div>
        <Button variant="secondary" onClick={handleRestart}>
          Restart simulation
        </Button>
      </div>
    </div>
  )
}
