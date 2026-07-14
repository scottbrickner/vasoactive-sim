import { cerner } from '../../design/deviceTokens'

const ROWS = ['HR', 'BP', 'MAP', 'SpO2', 'Rhythm']

/**
 * Faithful (not stylized) replica of the Cerner iView flowsheet band.
 *
 * Deliberately does NOT label columns with the CP 4-156 documentation-cadence checkpoints
 * ("At initiation", "+30 min after start", …) — a real flowsheet has no such labels, it
 * just shows result times as they're charted. Surfacing the cadence in the UI would hand
 * the learner the answer to "when do I need to chart?" instead of requiring them to know
 * the policy (see data/policy.ts DOCUMENTATION_CADENCE, which the engine validates against
 * in Phase 4 — that knowledge stays server-side, not in the chrome).
 */
export function CernerIView() {
  return (
    <div className="overflow-hidden rounded-md border" style={{ borderColor: cerner.gridLine }}>
      <div
        className="px-3 py-2 text-sm font-semibold"
        style={{ backgroundColor: cerner.chrome, color: cerner.chromeText }}
      >
        iView — Flowsheet
      </div>
      <table className="w-full border-collapse text-sm" style={{ color: cerner.ink }}>
        <thead>
          <tr style={{ backgroundColor: cerner.surfaceAlt }}>
            <th
              className="border-b px-3 py-1.5 text-left text-xs font-semibold uppercase"
              style={{ borderColor: cerner.gridLine, color: cerner.muted }}
            >
              Parameter
            </th>
            <th
              className="border-b px-3 py-1.5 text-left text-xs font-semibold uppercase"
              style={{ borderColor: cerner.gridLine, color: cerner.muted }}
            >
              Result
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row} className="border-b last:border-0" style={{ borderColor: cerner.gridLine }}>
              <td className="px-3 py-2 font-medium">{row}</td>
              <td className="px-3 py-2" style={{ color: cerner.muted }}>
                —
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div
        className="border-t px-3 py-2 text-xs"
        style={{ borderColor: cerner.gridLine, color: cerner.muted, backgroundColor: cerner.surfaceAlt }}
      >
        No results charted for this band yet.
      </div>
    </div>
  )
}
