import { describe, expect, it } from 'vitest'
import { DEFAULT_SESSION, channelName, newSessionId, storageKeyFor } from '../sync/sessionKeys'

describe('sessionKeys', () => {
  it('scopes the channel name to the session id', () => {
    expect(channelName('abc123')).toBe('vasoactive-sim:abc123')
  })

  it('falls back to DEFAULT_SESSION when the session id is empty/null/undefined', () => {
    expect(channelName('')).toBe(`vasoactive-sim:${DEFAULT_SESSION}`)
    expect(channelName(null)).toBe(`vasoactive-sim:${DEFAULT_SESSION}`)
    expect(channelName(undefined)).toBe(`vasoactive-sim:${DEFAULT_SESSION}`)
  })

  it('scopes the storage key to the session id, distinct from the channel name', () => {
    expect(storageKeyFor('abc123')).toBe('vasoactive-sim:state:abc123')
    expect(storageKeyFor('abc123')).not.toBe(channelName('abc123'))
  })

  it('different session ids never collide on channel name or storage key', () => {
    expect(channelName('session-a')).not.toBe(channelName('session-b'))
    expect(storageKeyFor('session-a')).not.toBe(storageKeyFor('session-b'))
  })

  it('newSessionId generates distinct, non-empty ids across repeated calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => newSessionId()))
    expect(ids.size).toBe(20)
    for (const id of ids) {
      expect(id.length).toBeGreaterThan(0)
    }
  })
})
