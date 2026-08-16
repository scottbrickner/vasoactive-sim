import type { ReactNode } from 'react'

/**
 * A shared rounded status-pill shape for device screens ONLY — the inverse of
 * design/primitives/Button.tsx's own comment ("Not for device screens... those get
 * faithful replicas later"): this is for device screens and should never be imported
 * into the branded app shell.
 *
 * Phase 17: extracted after the same pill idiom was found independently reimplemented
 * in AlarisPump.tsx (StatusBadge), CernerMAR.tsx (BeginBagBadge), CernerChartingStatus.tsx
 * (StatusBadge), and InfusionsPanel.tsx (inline STATUS_COLOR/STATUS_LABEL) — four copies
 * of one shape, a real drift risk (e.g. one call site forgetting to pair color with text).
 *
 * Deliberately takes explicit `backgroundColor`/`color` props rather than importing
 * `philips`/`alaris`/`cerner` itself — each device keeps owning its own tone→color
 * mapping via its own token object, so this component never couples the three device
 * palettes together.
 */
export interface DeviceStatusBadgeProps {
  label: string
  backgroundColor: string
  color: string
  /** Rendered before the label — e.g. an LED dot. Purely decorative; the text label is
   *  what satisfies the "not color-only" requirement, not this. */
  icon?: ReactNode
}

export function DeviceStatusBadge({ label, backgroundColor, color, icon }: DeviceStatusBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[0.65rem] font-bold whitespace-nowrap"
      style={{ backgroundColor, color }}
    >
      {icon}
      {label}
    </span>
  )
}
