/**
 * Local persistence for the skill-tracking store (Phase 15) — hand-rolled localStorage
 * read/write, not Zustand's `persist` middleware (nothing in this codebase uses it;
 * this mirrors the existing try/catch localStorage convention already established in
 * sync/simSync.ts's safeGetItem/safeSetItem and config/access.ts).
 *
 * Deliberately a SEPARATE storage key from anything simSync.ts touches — this data is
 * this browser's own learner record and must never be overwritten by a facilitated
 * session's cross-window state broadcast (see state/skillTrackingStore.ts's doc
 * comment for the full reasoning).
 */
import type { AttemptRecord, LearnerIdentity } from '../engine/skillAttempt'

const STORAGE_KEY = 'vasoactive-sim:skill-tracking'

export interface StoredSkillState {
  learnerIdentity: LearnerIdentity | null
  skillAttempts: AttemptRecord[]
}

const EMPTY: StoredSkillState = { learnerIdentity: null, skillAttempts: [] }

/** Synchronous read, called once at skillTrackingStore.ts's module-load time. Safe no-op on unavailable/corrupted storage. */
export function loadStoredSkillState(): StoredSkillState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw)
    return {
      learnerIdentity: parsed?.learnerIdentity ?? null,
      skillAttempts: Array.isArray(parsed?.skillAttempts) ? parsed.skillAttempts : [],
    }
  } catch {
    return EMPTY
  }
}

/** Safe write-through, called after every mutation. Degrades to in-memory-only on quota/private-mode/disabled storage. */
export function persistSkillState(state: StoredSkillState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // quota / private-mode / disabled storage — state stays in memory for this session only
  }
}
