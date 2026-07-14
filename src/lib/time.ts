/** Formats sim-clock minutes as HH:MM, matching the header readout. */
export function formatClock(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes))
  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Formats minutes-before-sim-start as a signed HH:MM offset, e.g. -180 -> "-3:00". */
export function formatRelativeMinutes(minutesBeforeStart: number): string {
  const total = Math.max(0, Math.floor(minutesBeforeStart))
  const hh = Math.floor(total / 60)
  const mm = String(total % 60).padStart(2, '0')
  return `-${hh}:${mm}`
}
