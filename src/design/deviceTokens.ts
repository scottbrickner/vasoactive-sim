/**
 * Device-fidelity color tokens — faithful replicas, NOT the branded shell palette.
 *
 * Deliberately separate from src/design/tokens.ts (USC Cardinal/Gold) per CLAUDE.md:
 * "Two visual registers... Don't stylize the device screens." Device components apply
 * these via inline style, not Tailwind's @theme, so they never inherit brand utilities.
 */

export const philips = {
  background: '#05080a',
  panelBorder: '#1f2937',
  label: '#9ca3af',
  ecgGreen: '#22e06b',
  abpRed: '#ff4d4d',
  spo2Cyan: '#22d3ee',
  /** Phase 17 chrome tokens — bezel/wordmark/softkey chrome only, never physiology-tied. */
  wordmark: '#6b7684',
  topStripBg: '#0d1418',
  bedTagBg: '#2b6cb0',
  softkeyBg: '#12191f',
  softkeyBorder: '#2a3540',
  softkeyText: '#c7d0d8',
  softkeyActiveBg: '#d4a017',
  softkeyActiveText: '#1a1400',
} as const

export const alaris = {
  /** Phase 17: real hardware chassis is light gray plastic — this replaces `chassis` as
   *  the primary card background. `chassisDark` is KEPT (not deleted) for recessed
   *  accents (screen bezels, button wells) where the real unit is genuinely darker. */
  chassisLight: '#d7dade',
  chassisLightBorder: '#aab0b8',
  /** Text/border pair for ghost-style controls on the NEW light chassis — the inverse of
   *  the old DEVICE_GHOST_STYLE, which was tuned for the light-on-dark `chassis` below. */
  onLightMuted: '#3a4249',
  onLightBorder: '#7c848c',
  chassis: '#33383d',
  chassisDark: '#202327',
  lcd: '#c9d6d0',
  lcdInk: '#16211d',
  lcdMuted: '#4b5a54',
  softLimit: '#b26a00',
  hardLimit: '#c62828',
  activeGreen: '#2f9e57',
} as const

export const cerner = {
  chrome: '#1f4e79',
  chromeText: '#ffffff',
  surface: '#ffffff',
  surfaceAlt: '#f4f6f8',
  gridLine: '#d8dee4',
  ink: '#20303d',
  muted: '#5b6b77',
  pending: '#b26a00',
  pendingBg: '#fdf0dc',
  complete: '#2e7d32',
  completeBg: '#e6f4ea',
  stopped: '#c62828',
  /** Phase 17: dark-navy "Continuous Infusions" section header, and the highlighted
   *  treatment for a cell that lands exactly on a real rate-change minute — always paired
   *  with bold weight + a text label, never color alone (CLAUDE.md's no-color-only rule). */
  continuousInfusionsHeader: '#14324d',
  rateChangeBg: '#eaf1fb',
  rateChangeText: '#1f4e79',
} as const
