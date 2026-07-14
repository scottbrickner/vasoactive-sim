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
} as const

export const alaris = {
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
} as const
