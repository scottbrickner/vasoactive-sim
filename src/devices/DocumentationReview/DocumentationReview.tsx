import { cerner } from '../../design/deviceTokens'
import { DeviceStatusBadge } from '../shared'
import { formatClock } from '../../lib/time'
import type { LogEntry } from '../../state/types'

export interface DocumentationReviewProps {
  log: LogEntry[]
}

/**
 * Faithful (not stylized) Cerner-style chart review — the full session log, chronological.
 * Debrief-only: this is retrospective, so (unlike the live iView) it's fine to show
 * everything, including which entries were actions vs. documentation.
 */
export function DocumentationReview({ log }: DocumentationReviewProps) {
  const sorted = [...log].sort((a, b) => a.minute - b.minute)
  return (
    <div className="overflow-hidden rounded-md border" style={{ borderColor: cerner.gridLine }}>
      <div
        className="px-3 py-2 text-sm font-semibold"
        style={{ backgroundColor: cerner.chrome, color: cerner.chromeText }}
      >
        Documentation Review
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ color: cerner.ink }}>
          <thead>
            <tr style={{ backgroundColor: cerner.surfaceAlt }}>
              {['Time', 'Type', 'Location', 'Entry'].map((h) => (
                <th
                  key={h}
                  className="border-b px-3 py-1.5 text-left text-xs font-semibold uppercase whitespace-nowrap"
                  style={{ borderColor: cerner.gridLine, color: cerner.muted }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center" style={{ color: cerner.muted }}>
                  No entries recorded this session.
                </td>
              </tr>
            ) : (
              sorted.map((entry, i) => (
                <tr
                  key={entry.id}
                  className="border-b last:border-0"
                  style={{ borderColor: cerner.gridLine, backgroundColor: i % 2 === 1 ? cerner.surfaceAlt : cerner.surface }}
                >
                  <td className="px-3 py-2 font-mono whitespace-nowrap">{formatClock(entry.minute)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <TypeBadge type={entry.type} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{entry.location ?? '—'}</td>
                  <td className="px-3 py-2">{entry.summary}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TypeBadge({ type }: { type: LogEntry['type'] }) {
  const isDoc = type === 'documentation'
  return (
    <DeviceStatusBadge
      label={isDoc ? 'Documentation' : 'Action'}
      backgroundColor={isDoc ? cerner.completeBg : cerner.pendingBg}
      color={isDoc ? cerner.complete : cerner.pending}
    />
  )
}
