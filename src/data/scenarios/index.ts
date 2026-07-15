import type { ScenarioConfig } from '../../state/types'
import { NEUTROPENIC_SEPTIC_SHOCK } from './neutropenicSepticShock'
import { SINGLE_AGENT_EARLY_NOTIFICATION } from './singleAgentEarlyNotification'
import { SEQUENTIAL_PRESSOR_ESCALATION } from './sequentialPressorEscalation'
import { WEANING_SUPPORT } from './weaningSupport'

export const SCENARIOS: Record<string, ScenarioConfig> = {
  [NEUTROPENIC_SEPTIC_SHOCK.id]: NEUTROPENIC_SEPTIC_SHOCK,
  [SINGLE_AGENT_EARLY_NOTIFICATION.id]: SINGLE_AGENT_EARLY_NOTIFICATION,
  [SEQUENTIAL_PRESSOR_ESCALATION.id]: SEQUENTIAL_PRESSOR_ESCALATION,
  [WEANING_SUPPORT.id]: WEANING_SUPPORT,
}

// Kept as a stable reference for existing test fixtures — randomization is additive at
// the UI layer (ScenarioIntro.tsx), not a replacement for a known-fixed default.
export const DEFAULT_SCENARIO = NEUTROPENIC_SEPTIC_SHOCK

export { NEUTROPENIC_SEPTIC_SHOCK, SINGLE_AGENT_EARLY_NOTIFICATION, SEQUENTIAL_PRESSOR_ESCALATION, WEANING_SUPPORT }
