import { create } from 'zustand'
import type { HeaderReadout, Phase } from './types'

/**
 * Phase 1 shell store. Holds only the flow phase and placeholder header readout.
 * The clinical engine, infusions, vitals, orders, and log join this store in later phases.
 */
interface ShellState {
  phase: Phase
  header: HeaderReadout
  setPhase: (phase: Phase) => void
}

/** Placeholder values — replaced by the scenario config + physiology engine (Phases 2–4). */
const placeholderHeader: HeaderReadout = {
  clockMinutes: 0,
  currentMap: null,
  targetMap: 65,
}

export const useShellStore = create<ShellState>((set) => ({
  phase: 'intro',
  header: placeholderHeader,
  setPhase: (phase) => set({ phase }),
}))
