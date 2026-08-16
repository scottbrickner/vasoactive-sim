import { alaris } from '../../design/deviceTokens'

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['CLEAR', '0', 'ENTER'],
] as const

/**
 * The central "Alaris PC" control module from the real ganged pump array — purely
 * decorative, no functional props, no callbacks. The real device's central touchscreen
 * is contextual to whichever small channel module is currently "selected" via CHANNEL
 * SELECT; wiring that up would require introducing a "currently selected channel"
 * interaction concept that doesn't exist anywhere in state/store.ts today — a genuine
 * interaction-model change, not a visual one. It would also mean replacing each
 * channel's native `<input type=number>` (which already gets `inputMode="decimal"` for
 * a real numeric keyboard on mobile/tablet) with a slower, less-accessible virtual
 * keypad, for no clinical benefit. So every dose still gets programmed on its own
 * channel module (AlarisChannelModule.tsx), exactly as before this phase — this module
 * only supplies the surrounding hardware chrome. Nothing here forecloses a later phase
 * wiring a real "selected channel" surface into this module, since it holds no state.
 */
export function AlarisCentralModule() {
  return (
    <div
      className="flex w-full flex-col gap-3 rounded-lg border p-3 md:w-56 md:shrink-0"
      style={{ backgroundColor: alaris.chassisLight, borderColor: alaris.chassisLightBorder }}
      aria-hidden
    >
      <div className="flex items-center justify-between px-1 text-[0.65rem] font-semibold" style={{ color: alaris.onLightMuted }}>
        <span>Alaris PC</span>
        <span>Guardrails</span>
      </div>

      <div
        className="flex h-28 items-center justify-center rounded-sm border text-[0.6rem]"
        style={{ backgroundColor: alaris.chassisDark, borderColor: alaris.chassisLightBorder, color: alaris.lcdMuted }}
      >
        SYSTEM READY
      </div>

      <div className="grid grid-cols-2 gap-1">
        {KEYPAD_ROWS.flat().map((key, i) => (
          <span
            key={`${key}-${i}`}
            className="col-span-1 rounded-sm border py-1 text-center font-mono text-[0.65rem]"
            style={{ borderColor: alaris.chassisLightBorder, color: alaris.onLightMuted, backgroundColor: '#eceef0' }}
          >
            {key}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span
          className="flex-1 rounded-sm px-2 py-1.5 text-center text-[0.6rem] font-bold text-white"
          style={{ backgroundColor: alaris.softLimit }}
        >
          START / OPTIONS
        </span>
        <span
          className="rounded-full px-2 py-1.5 text-center text-[0.6rem] font-bold text-white"
          style={{ backgroundColor: alaris.activeGreen }}
        >
          ⏻
        </span>
      </div>
      <div className="flex items-center justify-between text-[0.6rem]">
        <span className="font-semibold" style={{ color: alaris.onLightMuted }}>
          SYSTEM ON
        </span>
        <span className="rounded-sm px-2 py-1 font-bold text-white" style={{ backgroundColor: alaris.hardLimit }}>
          CANCEL
        </span>
      </div>
    </div>
  )
}
