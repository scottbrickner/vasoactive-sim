/**
 * Fire-and-forget usage beacon to a Power Automate HTTP-trigger flow (Phase 15) —
 * ported from zoll-r-series-simulator's sync/telemetry.js, with one deliberate
 * deviation: ZOLL's version sends `mode: 'no-cors'` with no Content-Type header (so the
 * browser defaults to text/plain) specifically to dodge a CORS preflight. Verified live
 * against this app's actual Power Automate flow that this backfires — the trigger
 * doesn't parse a text/plain body into a real JSON object, so every field downstream
 * (including the `categories` array an Apply-to-each loop depends on) resolves as
 * null/undefined, and the flow run fails. A plain CORS POST with a real
 * `Content-Type: application/json` header, verified against the live endpoint, returns
 * 202 and every field lands correctly — Azure Logic Apps' Request trigger (what Power
 * Automate's HTTP trigger runs on) handles the CORS preflight itself, so no extra
 * server-side configuration is needed for this to work from a browser.
 *
 * Reuses the SAME env var name (VITE_POWER_AUTOMATE_URL) as the sibling app for
 * platform consistency (CLAUDE.md: "First app on a small shared simulator platform") —
 * each app builds/deploys independently with its own secret, so there's no collision
 * risk in sharing the name. Configured via a local .env before `npm run build`/`deploy`
 * (this repo has no CI workflow, unlike ZOLL's .github/workflows/deploy-pages.yml).
 *
 * As of Phase 18, this is the ONLY completion-recording/notification path — the old
 * manual Teams-folder-save + JSON/CSV download UI (app/SkillAttemptPanel.tsx) was
 * replaced with a plain "recorded automatically" confirmation, since every attempt
 * (training and validation alike) already reaches this beacon via
 * useSkillTrackingStore's recordAttempt. The receiving Power Automate flow is expected
 * to also email a results summary to the record's `learnerEmail` (when non-empty) —
 * same shape of "flow does the real work, this client just POSTs the record" split
 * already established for the ZOLL sim, but that email step itself lives in the
 * Power Automate flow's own designer, not in this codebase — nothing here can build or
 * verify it. If `learnerEmail` is empty (identity wasn't captured — optional in
 * Training mode), the flow has no address to send to; the record still POSTs.
 */
import type { AttemptRecord } from '../engine/skillAttempt'

const ENDPOINT = import.meta.env.VITE_POWER_AUTOMATE_URL || ''

export function telemetryEnabled(): boolean {
  return !!ENDPOINT
}

export function sendAttemptTelemetry(record: AttemptRecord): void {
  if (!ENDPOINT) return
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    }).catch(() => {})
  } catch {
    // telemetry must never break the learner flow
  }
}
