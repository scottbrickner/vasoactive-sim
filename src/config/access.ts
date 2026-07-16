/**
 * Facilitator role gate — near-verbatim port of zoll-r-series-simulator's
 * src/config/access.js, renamed to this app's namespace.
 *
 * IMPORTANT: this is CLIENT-SIDE DETERRENCE ONLY. The app is a static front-end with
 * no backend, so the passcode ships in the bundle and a determined user could bypass
 * it via the URL or devtools. It keeps casual/bedside users out of the full
 * facilitator tools — it is NOT real authentication. For true per-user auth you'd
 * need to add a backend. (User-confirmed acceptable for this training tool on a
 * controlled device/network — see Phase 10 plan.)
 *
 * Change the passcode by editing DEFAULT_PASSCODE, or set
 * VITE_FACILITATOR_PASSCODE at build time (e.g. in an .env file) so it isn't
 * hard-coded here.
 */
const DEFAULT_PASSCODE = 'vts-educator'
export const FACILITATOR_PASSCODE: string = import.meta.env.VITE_FACILITATOR_PASSCODE || DEFAULT_PASSCODE

const ROLE_KEY = 'vasoactive-sim:facilitator-role'

export type FacilitatorRole = 'sme' | 'educator'

/** 'educator' (full tools) once unlocked on this browser, else 'sme' (locked). */
export function getFacilitatorRole(): FacilitatorRole {
  try {
    return localStorage.getItem(ROLE_KEY) === 'educator' ? 'educator' : 'sme'
  } catch {
    return 'sme'
  }
}

/** Returns true and persists the unlock if the code matches. */
export function unlockFacilitator(code: string): boolean {
  if (String(code).trim() === FACILITATOR_PASSCODE) {
    try {
      localStorage.setItem(ROLE_KEY, 'educator')
    } catch {
      /* storage unavailable — unlock is not persisted */
    }
    return true
  }
  return false
}

/** Re-locks (back to SME) on this browser. */
export function lockFacilitator(): void {
  try {
    localStorage.removeItem(ROLE_KEY)
  } catch {
    /* ignore */
  }
}
