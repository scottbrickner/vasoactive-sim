/**
 * A SECOND, independent Zustand store for the skill-tracking feature (Phase 15) —
 * deliberately NOT fields on useSimStore (state/store.ts). Reasoning, confirmed by
 * reading sync/simSync.ts directly: when a facilitated `?session=` window is open,
 * broadcastState() mirrors useSimStore.getState() — the ENTIRE store, verbatim — to
 * every other window on the same session, and an incoming message applies it via
 * useSimStore.setState(msg.payload) with no merge, no field allowlist. Any field added
 * directly to useSimStore would be silently overwritten by whatever a facilitator's
 * (or a second device's) window last broadcast — a real data-integrity bug for a
 * feature whose entire point is "this browser's own learner record." Sync is a no-op
 * for every standalone/solo-practice load (main.tsx only calls initSimSync when a
 * `?session=` is present), so this only matters for Phase 10's facilitated mode — but
 * a second store sidesteps the risk entirely, at zero cost to the default path.
 */
import { create } from 'zustand'
import type { Scorecard } from '../engine/scoring'
import { buildAttemptRecord, type AttemptRecord, type LearnerIdentity } from '../engine/skillAttempt'
import { loadStoredSkillState, persistSkillState } from '../sync/skillTracking'
import { sendAttemptTelemetry } from '../sync/telemetry'
import type { SimMode } from './types'

let attemptIdCounter = 0
function nextAttemptId(): string {
  attemptIdCounter += 1
  return `attempt-${Date.now().toString(36)}-${attemptIdCounter}`
}

interface SkillTrackingStore {
  learnerIdentity: LearnerIdentity | null
  skillAttempts: AttemptRecord[]
  setLearnerIdentity: (identity: LearnerIdentity) => void
  recordAttempt: (params: {
    card: Scorecard
    scenarioId: string
    scenarioLabel: string
    mode: SimMode
  }) => AttemptRecord
}

const initial = loadStoredSkillState()

export const useSkillTrackingStore = create<SkillTrackingStore>((set, get) => ({
  learnerIdentity: initial.learnerIdentity,
  skillAttempts: initial.skillAttempts,

  setLearnerIdentity: (identity) => {
    set({ learnerIdentity: identity })
    persistSkillState({ learnerIdentity: identity, skillAttempts: get().skillAttempts })
  },

  recordAttempt: ({ card, scenarioId, scenarioLabel, mode }) => {
    const identity = get().learnerIdentity
    const record = buildAttemptRecord({
      attemptId: nextAttemptId(),
      scenarioId,
      scenarioLabel,
      mode,
      identity,
      card,
    })
    const skillAttempts = [...get().skillAttempts, record]
    set({ skillAttempts })
    persistSkillState({ learnerIdentity: identity, skillAttempts })
    sendAttemptTelemetry(record)
    return record
  },
}))
