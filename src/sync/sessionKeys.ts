/**
 * Pure session-scope helpers (no React/Zustand) — near-verbatim port of
 * zoll-r-series-simulator's src/sync/sessionKeys.js, renamed to this app's namespace.
 */

const BASE = 'vasoactive-sim'
export const DEFAULT_SESSION = 'default'

/** BroadcastChannel name scoped to a session id. */
export function channelName(sessionId: string | null | undefined): string {
  return `${BASE}:${sessionId || DEFAULT_SESSION}`
}

/** localStorage key scoped to a session id. */
export function storageKeyFor(sessionId: string | null | undefined): string {
  return `${BASE}:state:${sessionId || DEFAULT_SESSION}`
}

/** Generates a short, URL-safe, reasonably unique session id. */
let idSeq = 0
export function newSessionId(): string {
  idSeq += 1
  return (Date.now().toString(36) + idSeq.toString(36)).slice(-7)
}
