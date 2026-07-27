import { useSimStore } from '../../state/store'
import { useSkillTrackingStore } from '../../state/skillTrackingStore'
import { SKILL_SIGNOFF_CRITERIA } from '../../data/policy'
import { Button, Panel } from '../../design/primitives'
import { exportAttemptCSV, exportAttemptJSON, exportAttemptsHistoryCSV } from '../../sync/skillAttemptExport'

/**
 * "My Skill Status" — a standalone, shell-register page (CLAUDE.md: friendly branded
 * shell, not a device replica), reachable from the header. Reads only from
 * useSkillTrackingStore (this browser's own local record, see that store's doc
 * comment) — no backend, no roster across learners/devices.
 */
export function SkillStatus() {
  const setPhase = useSimStore((s) => s.setPhase)
  const learnerIdentity = useSkillTrackingStore((s) => s.learnerIdentity)
  const skillAttempts = useSkillTrackingStore((s) => s.skillAttempts)
  const satisfyingAttempt = skillAttempts.find((a) => a.passed) ?? null
  const history = [...skillAttempts].reverse()

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <p className="text-sm font-semibold tracking-wide text-cardinal uppercase">My Skill Status</p>
        <h1 className="mt-1 text-3xl font-bold text-ink">Vasoactive titration sign-off</h1>
        <p className="mt-2 max-w-2xl text-lg text-muted">
          Tracked on this browser only — attempts and identity are stored locally, not on a shared
          server.
        </p>
      </div>

      <Panel title="Learner">
        {learnerIdentity ? (
          <p className="text-base text-ink">
            {learnerIdentity.name} · {learnerIdentity.email}
          </p>
        ) : (
          <p className="text-sm text-muted">
            No identity captured yet — enter one on the scenario intro screen before a Validation run.
          </p>
        )}
      </Panel>

      <Panel title="Skill requirement">
        {satisfyingAttempt ? (
          <p className="text-base text-ink">
            Met — {satisfyingAttempt.scenarioLabel} on {new Date(satisfyingAttempt.recordedAt).toLocaleString()}.
          </p>
        ) : (
          <p className="text-sm text-muted">
            Not yet met — complete any one of the four scenarios in Validation mode with a passing score
            (≥{SKILL_SIGNOFF_CRITERIA.minOverallPercent}%, no missed categories).
          </p>
        )}
      </Panel>

      <Panel
        title="Attempt history"
        actions={
          history.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => exportAttemptsHistoryCSV(skillAttempts)}>
              Export all (CSV)
            </Button>
          )
        }
      >
        {history.length === 0 ? (
          <p className="text-sm text-muted">No attempts recorded yet on this browser.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((a) => (
              <li key={a.attemptId} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-ink">
                  {new Date(a.recordedAt).toLocaleString()} · {a.scenarioLabel} · {a.mode} ·{' '}
                  {a.overallPercent ?? '—'}% · {a.mode === 'validation' ? (a.passed ? 'Passed' : 'Not passed') : '—'}
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => exportAttemptJSON(a)}>
                    JSON
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => exportAttemptCSV(a)}>
                    CSV
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div>
        <Button variant="secondary" onClick={() => setPhase('intro')}>
          Back to home
        </Button>
      </div>
    </div>
  )
}
