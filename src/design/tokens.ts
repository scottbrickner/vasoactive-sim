/**
 * Design tokens — TypeScript mirror of the CSS `@theme` block in src/index.css.
 *
 * The CSS block is the source of truth for Tailwind utility generation; this file
 * exposes the same values to JS/TS (inline styles, canvas/charts later, tests).
 * Keep the two in sync. Phase 1 scope: the friendly USC-branded APP SHELL only.
 */

export const color = {
  cardinal: '#990000',
  cardinalDark: '#7a0000',
  cardinalLight: '#b32424',
  gold: '#ffcc00',
  goldDark: '#e6b800',
  goldSoft: '#fff3c4',

  bg: '#faf8f5',
  surface: '#ffffff',
  border: '#e7e2da',
  ink: '#1a1a1a',
  muted: '#5b5750',

  success: '#2e7d32',
  warning: '#b26a00',
  danger: '#c62828',
  info: '#1565c0',
} as const

export const font = {
  heading: "'Montserrat', ui-sans-serif, system-ui, sans-serif",
  body: "'Source Sans 3 Variable', 'Source Sans 3', ui-sans-serif, system-ui, sans-serif",
} as const

/** Type scale in rem — matches Tailwind's default text-* utilities. */
export const fontSize = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.875rem',
  '4xl': '2.25rem',
} as const

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const

/** Semantic spacing aliases (the 4px base scale lives in Tailwind utilities). */
export const space = {
  gutter: '1.5rem',
  section: '3rem',
} as const

export const radius = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  pill: '9999px',
} as const

export const shadow = {
  sm: '0 1px 2px rgba(40, 30, 20, 0.06), 0 1px 1px rgba(40, 30, 20, 0.04)',
  md: '0 4px 12px rgba(40, 30, 20, 0.08), 0 2px 4px rgba(40, 30, 20, 0.05)',
  lg: '0 12px 32px rgba(40, 30, 20, 0.12), 0 4px 8px rgba(40, 30, 20, 0.06)',
} as const

/** Stacking order for shell overlays. */
export const z = {
  header: 40,
  toast: 60,
} as const

export const tokens = { color, font, fontSize, fontWeight, space, radius, shadow, z } as const
export type Tokens = typeof tokens
