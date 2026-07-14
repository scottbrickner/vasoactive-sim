/**
 * Documentation placement validation (BUILD_BRIEF §7 / §9 Phase 5): enforces the
 * CP 4-156 MAR-vs-iView split. Pure — no store coupling.
 *
 * In this simulator the UI itself makes the wrong placement unreachable (the MAR
 * screen only ever writes 'MAR' entries, iView only ever writes 'iView' entries —
 * mirroring how the real systems are literally separate applications). These
 * functions exist so that mapping is asserted and unit-tested rather than implied,
 * and so the store has a single source of truth to construct entries from.
 */
import { DOCUMENTATION_PLACEMENT } from '../data/policy'
import type { DocumentationLocation } from '../state/types'

export type DocumentationKind = keyof typeof DOCUMENTATION_PLACEMENT

export function correctLocationFor(kind: DocumentationKind): DocumentationLocation {
  return DOCUMENTATION_PLACEMENT[kind]
}

export function isCorrectlyPlaced(kind: DocumentationKind, location: DocumentationLocation): boolean {
  return location === correctLocationFor(kind)
}
