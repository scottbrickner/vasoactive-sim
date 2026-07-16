import { useState } from 'react'
import { Button, Field, Panel } from '../../design/primitives'
import { useSimStore } from '../../state/store'
import { initSimSync } from '../../sync/simSync'
import { newSessionId } from '../../sync/sessionKeys'

type WindowRole = 'learner' | 'facilitator'

/**
 * Session launcher (Phase 10) — generates a session id and opens session-scoped
 * learner/facilitator windows that stay in sync on this device via BroadcastChannel +
 * localStorage (see sync/simSync.ts), no server involved. Reached via `?role=launcher`
 * — never shown in standalone solo-practice mode (no `?session=` present at all),
 * which needs zero special-casing and keeps working exactly as it always has.
 */
export function Launcher() {
  const [sessionId, setSessionId] = useState(newSessionId)
  const [proctorName, setProctorName] = useState('')
  const [copied, setCopied] = useState<WindowRole | null>(null)
  const proctor = useSimStore((s) => s.proctor)
  const setProctor = useSimStore((s) => s.setProctor)

  const linkFor = (role: WindowRole) =>
    `${window.location.origin}${window.location.pathname}?role=${role}&session=${sessionId}`

  function open(role: WindowRole) {
    // First touch of this session id in this window — becomes a live sync
    // participant so a proctor name set here (or subsequent facilitator actions)
    // reaches whatever windows open next.
    initSimSync(sessionId)
    window.open(linkFor(role), '_blank')
  }

  async function copy(role: WindowRole) {
    try {
      await navigator.clipboard.writeText(linkFor(role))
      setCopied(role)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied(null)
    }
  }

  function handleStartProctoring() {
    if (!proctorName.trim()) return
    initSimSync(sessionId)
    setProctor(proctorName.trim())
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-gutter px-gutter py-section">
      <div>
        <p className="text-sm font-semibold tracking-wide text-cardinal uppercase">Facilitated session</p>
        <h1 className="mt-1 text-3xl font-bold text-ink">Vasoactive Titration Simulator</h1>
        <p className="mt-2 max-w-2xl text-lg text-muted">
          Open a facilitator console and a learner window that stay in sync on this device — no
          server, no login. Solo practice doesn't need any of this; just open the app directly.
        </p>
      </div>

      <Panel title="Session">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field
            label="Session ID"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value.trim())}
            help="Windows sharing this id stay in sync; different ids never cross."
            className="flex-1"
          />
          <Button variant="secondary" onClick={() => setSessionId(newSessionId())}>
            New session
          </Button>
        </div>
      </Panel>

      <Panel title="Proctor (optional)">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field
            label="Name"
            value={proctorName}
            onChange={(e) => setProctorName(e.target.value)}
            placeholder="Who's proctoring this session?"
            className="flex-1"
          />
          <Button variant="secondary" onClick={handleStartProctoring} disabled={!proctorName.trim()}>
            Start proctoring
          </Button>
        </div>
        {proctor && (
          <p className="mt-3 text-sm text-muted">
            Recorded: {proctor.name}, {new Date(proctor.recordedAt).toLocaleString()}
          </p>
        )}
      </Panel>

      <div className="grid gap-gutter sm:grid-cols-2">
        <Panel title="Facilitator">
          <p className="text-sm text-muted">
            Pick a scenario, mirror the learner's screen, and — once unlocked — adjust vitals and
            orders live.
          </p>
          <div className="mt-3 flex gap-2">
            <Button disabled={!sessionId} onClick={() => open('facilitator')}>
              Open window
            </Button>
            <Button variant="ghost" disabled={!sessionId} onClick={() => copy('facilitator')}>
              {copied === 'facilitator' ? 'Copied ✓' : 'Copy link'}
            </Button>
          </div>
        </Panel>
        <Panel title="Learner">
          <p className="text-sm text-muted">The bedside workspace the trainee operates.</p>
          <div className="mt-3 flex gap-2">
            <Button disabled={!sessionId} onClick={() => open('learner')}>
              Open window
            </Button>
            <Button variant="ghost" disabled={!sessionId} onClick={() => copy('learner')}>
              {copied === 'learner' ? 'Copied ✓' : 'Copy link'}
            </Button>
          </div>
        </Panel>
      </div>

      <p className="text-sm text-muted">
        Tip: open the facilitator console on one screen and the learner window on another (or a
        second monitor). Both must stay on this same device and browser.
      </p>
    </div>
  )
}
