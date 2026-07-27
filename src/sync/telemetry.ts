/**
 * Fire-and-forget usage beacon to a Power Automate HTTP-trigger flow (Phase 15) —
 * direct port of zoll-r-series-simulator's sync/telemetry.js. Reuses the SAME env var
 * name (VITE_POWER_AUTOMATE_URL) as the sibling app for platform consistency
 * (CLAUDE.md: "First app on a small shared simulator platform") — each app
 * builds/deploys independently with its own secret, so there's no collision risk in
 * sharing the name.
 *
 * No flow exists for this app yet — left unset, this silently no-ops. Enabling it for
 * real later means either a local .env before `npm run build`/`deploy` (this repo has
 * no CI workflow, unlike ZOLL's .github/workflows/deploy-pages.yml), or introducing one
 * that injects a repo secret at build time, mirroring ZOLL's setup.
 */
import type { AttemptRecord } from '../engine/skillAttempt'

const ENDPOINT = import.meta.env.VITE_POWER_AUTOMATE_URL || ''

export function telemetryEnabled(): boolean {
  return !!ENDPOINT
}

export function sendAttemptTelemetry(record: AttemptRecord): void {
  if (!ENDPOINT) return
  try {
    fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', body: JSON.stringify(record) }).catch(() => {})
  } catch {
    // telemetry must never break the learner flow
  }
}
