import type { ScenarioConfig } from '../../state/types'
import { NEUTROPENIC_SEPTIC_SHOCK } from './neutropenicSepticShock'

export const SCENARIOS: Record<string, ScenarioConfig> = {
  [NEUTROPENIC_SEPTIC_SHOCK.id]: NEUTROPENIC_SEPTIC_SHOCK,
}

export const DEFAULT_SCENARIO = NEUTROPENIC_SEPTIC_SHOCK

export { NEUTROPENIC_SEPTIC_SHOCK }
