import { Button } from '../../design/primitives'
import { lockFacilitator } from '../../config/access'
import { FacilitatorConsole } from './FacilitatorConsole'
import { OverrideControls } from './OverrideControls'

interface FacilitatorProps {
  onLock: () => void
}

/**
 * Unlocked (educator) facilitator tier: everything the locked tier has (see
 * FacilitatorConsole), plus live override controls (see OverrideControls) — vitals,
 * response-model, deterioration force-buttons, and med-order editing.
 */
export function Facilitator({ onLock }: FacilitatorProps) {
  function handleLock() {
    lockFacilitator()
    onLock()
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-gutter px-gutter py-section">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold tracking-wide text-cardinal uppercase">Facilitator — unlocked</p>
        <Button variant="ghost" size="sm" onClick={handleLock}>
          Lock
        </Button>
      </div>
      <FacilitatorConsole>
        <OverrideControls />
      </FacilitatorConsole>
    </div>
  )
}
