import { useState } from 'react'
import { getFacilitatorRole, type FacilitatorRole } from '../../config/access'
import { FacilitatorBasic } from './FacilitatorBasic'
import { Facilitator } from './Facilitator'

/**
 * Branches between the locked (SME) and unlocked (educator) facilitator tiers.
 * `getFacilitatorRole()` reads a plain localStorage flag (not React state), so the
 * role is mirrored into local state here and threaded down as unlock/lock callbacks
 * rather than re-read on every render.
 */
export function FacilitatorRoot() {
  const [role, setRole] = useState<FacilitatorRole>(getFacilitatorRole)

  return role === 'educator' ? (
    <Facilitator onLock={() => setRole('sme')} />
  ) : (
    <FacilitatorBasic onUnlock={() => setRole('educator')} />
  )
}
