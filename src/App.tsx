import { AppShell } from './app/AppShell'
import { ScenarioIntro } from './app/screens/ScenarioIntro'
import { Simulation } from './app/screens/Simulation'
import { Debrief } from './app/screens/Debrief'
import { Launcher } from './app/facilitator/Launcher'
import { FacilitatorRoot } from './app/facilitator/FacilitatorRoot'
import { useSimStore } from './state/store'

/**
 * Top-level router (Phase 10): URLSearchParams-based, no router dependency.
 *
 * - No `?role=` at all → today's standalone/solo-practice experience, completely
 *   unchanged (this is the default: just opening the app). Zero special-casing —
 *   cross-window sync is never initialized for this path (see main.tsx).
 * - `?role=launcher` → the session launcher (generates a session id, opens
 *   session-scoped learner/facilitator windows).
 * - `?role=learner&session=X` → the exact same learner experience below, just with
 *   sync initialized (see main.tsx) so its state mirrors to/from other windows on
 *   the same session id.
 * - `?role=facilitator&session=X` → the facilitator console (see FacilitatorRoot).
 */
export default function App() {
  const params = new URLSearchParams(window.location.search)
  const role = params.get('role')
  const sessionId = params.get('session')
  const phase = useSimStore((s) => s.phase)

  if (role === 'launcher') return <Launcher />
  if (role === 'facilitator' && sessionId) return <FacilitatorRoot />

  return (
    <AppShell>
      {phase === 'intro' && <ScenarioIntro />}
      {phase === 'sim' && <Simulation />}
      {phase === 'debrief' && <Debrief />}
    </AppShell>
  )
}
