import { useState } from 'react'
import { Button, Field, Panel } from '../../design/primitives'
import { unlockFacilitator } from '../../config/access'
import { FacilitatorConsole } from './FacilitatorConsole'

interface FacilitatorBasicProps {
  onUnlock: () => void
}

/**
 * Locked (SME) facilitator tier: the shared console (scenario picker, read-only
 * mirror, action feed — see FacilitatorConsole) plus a passcode form to promote to
 * the full educator tier. No override controls at this tier — those live in
 * Facilitator.tsx, gated behind the unlock.
 */
export function FacilitatorBasic({ onUnlock }: FacilitatorBasicProps) {
  const [passcode, setPasscode] = useState('')
  const [passcodeError, setPasscodeError] = useState(false)

  function handleUnlock() {
    if (unlockFacilitator(passcode)) {
      setPasscodeError(false)
      setPasscode('')
      onUnlock()
    } else {
      setPasscodeError(true)
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-gutter px-gutter py-section">
      <p className="text-sm font-semibold tracking-wide text-cardinal uppercase">Facilitator — locked</p>
      <FacilitatorConsole />
      <Panel title="Unlock full console">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field
            label="Educator passcode"
            type="password"
            value={passcode}
            onChange={(e) => {
              setPasscode(e.target.value)
              setPasscodeError(false)
            }}
            error={passcodeError ? 'Incorrect passcode.' : undefined}
            className="flex-1"
          />
          <Button variant="secondary" onClick={handleUnlock} disabled={!passcode}>
            Unlock
          </Button>
        </div>
      </Panel>
    </div>
  )
}
