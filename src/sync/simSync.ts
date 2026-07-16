/**
 * Cross-window sync for the learner/facilitator dual-screen mode — same protocol as
 * zoll-r-series-simulator's src/sync/SimulatorContext.jsx (session-scoped
 * BroadcastChannel + localStorage mirror, request-state/state handshake so a freshly
 * opened window hydrates immediately, an echo-guard flag to avoid re-broadcasting a
 * state update we just received), but wired Zustand-native rather than ported as a
 * React Context.
 *
 * `useSimStore` is a module-level singleton created once at import time — sync must
 * be initialized once, outside React's render lifecycle (see main.tsx), not as a hook.
 *
 * Echo-guard note: ZOLL's version clears its `applyingRemote` flag inside a
 * `useEffect` that fires on the NEXT tick after React's (batched, async) state update.
 * Zustand's `subscribe` listeners fire SYNCHRONOUSLY within `setState` itself, so the
 * flag here is set immediately before `setState` and cleared immediately after — no
 * next-tick indirection needed, since there's no render/effect cycle in between.
 */
import { useSimStore } from '../state/store'
import { channelName, storageKeyFor } from './sessionKeys'

export const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined'

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // quota / private-mode / disabled storage — sync degrades to BroadcastChannel-only
  }
}

type SyncMessage = { type: 'state'; payload: Partial<ReturnType<typeof useSimStore.getState>> } | { type: 'request-state' }

/**
 * Starts cross-window sync for the given session: hydrates synchronously from
 * localStorage (call before the first render so the initial paint already reflects
 * any existing session state), then wires live BroadcastChannel + localStorage
 * mirroring. Returns a teardown function.
 */
export function initSimSync(sessionId: string): () => void {
  const storageKey = storageKeyFor(sessionId)

  const stored = safeGetItem(storageKey)
  if (stored) {
    try {
      useSimStore.setState(JSON.parse(stored))
    } catch {
      // corrupted stored snapshot — ignore, keep the store's own default init
    }
  }

  let channel: BroadcastChannel | null = null
  if (hasBroadcastChannel) {
    try {
      channel = new BroadcastChannel(channelName(sessionId))
    } catch {
      channel = null
    }
  }

  let applyingRemote = false

  function broadcastState() {
    if (applyingRemote) return
    // JSON.stringify silently drops function-valued properties, so this snapshot
    // naturally contains only the store's data fields, never its action methods.
    const payload = useSimStore.getState()
    try {
      channel?.postMessage({ type: 'state', payload } satisfies SyncMessage)
    } catch {
      // structured-clone failure / closed channel — degrades to localStorage-only
    }
    safeSetItem(storageKey, JSON.stringify(payload))
  }

  if (channel) {
    channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      const msg = event.data
      if (!msg) return
      if (msg.type === 'state') {
        applyingRemote = true
        useSimStore.setState(msg.payload)
        applyingRemote = false
      } else if (msg.type === 'request-state') {
        channel!.postMessage({ type: 'state', payload: useSimStore.getState() } satisfies SyncMessage)
      }
    }
    try {
      channel.postMessage({ type: 'request-state' } satisfies SyncMessage)
    } catch {
      // ignore — this window just won't get an immediate hydration reply
    }
  }

  function onStorage(e: StorageEvent) {
    if (e.key === storageKey && e.newValue) {
      try {
        applyingRemote = true
        useSimStore.setState(JSON.parse(e.newValue))
        applyingRemote = false
      } catch {
        // malformed remote write — ignore
      }
    }
  }
  window.addEventListener('storage', onStorage)

  const unsubscribe = useSimStore.subscribe(broadcastState)

  return () => {
    unsubscribe()
    channel?.close()
    window.removeEventListener('storage', onStorage)
  }
}
