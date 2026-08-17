import { Panel } from '../design/primitives'
import { telemetryEnabled } from '../sync/telemetry'
import type { AttemptRecord } from '../engine/skillAttempt'

/**
 * Every attempt (training and validation alike) is already recorded automatically —
 * `useSkillTrackingStore`'s `recordAttempt` fires `sendAttemptTelemetry` (see
 * sync/telemetry.ts) the moment debrief is reached, POSTing the full AttemptRecord
 * (including `learnerEmail`) to the same Power Automate flow the sibling ZOLL sim
 * already uses. This panel used to offer manual Teams-folder-save + JSON/CSV download
 * buttons (Phase 15/16) — replaced with a plain confirmation, since there's no longer
 * anything for the learner to do: the flow itself is expected to email a results
 * summary to `learnerEmail` when one was entered (a Power Automate-side change, outside
 * this codebase — see telemetry.ts's doc comment). The Teams-folder/xlsx-workbook/
 * download machinery (sync/teamsFolder.ts, sync/skillTrackingWorkbook.ts,
 * sync/skillAttemptExport.ts) is left in place, unrouted, in case a future phase wants
 * manual export back — not deleted, matching this project's established "unroute, don't
 * rip out" convention (see Phase 17's device-replica components).
 *
 * `sendAttemptTelemetry` is fire-and-forget (never reports success/failure back to the
 * caller — same as ZOLL's own telemetry beacon), so this can only honestly confirm the
 * record was SENT, not that Power Automate/email delivery actually succeeded.
 */
export function SkillAttemptPanel({ record }: { record: AttemptRecord | null }) {
  if (!record) return null

  if (!telemetryEnabled()) {
    return (
      <Panel title="This attempt">
        <p className="text-sm text-muted">
          Automatic recording isn't configured for this session — no record was sent.
        </p>
      </Panel>
    )
  }

  const hasEmail = record.learnerEmail.trim() !== ''

  return (
    <Panel title="This attempt">
      <p className="text-sm text-ink">
        {hasEmail ? (
          <>
            Recorded automatically and emailed to <span className="font-medium">{record.learnerEmail}</span>.
          </>
        ) : (
          'Recorded automatically. No results email was sent — enter your institutional email on the intro screen next time to receive a copy.'
        )}
      </p>
    </Panel>
  )
}
