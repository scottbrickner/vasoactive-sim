export interface WaveformProps {
  kind: 'ecg' | 'art' | 'pleth'
  color: string
  /** Seconds per cardiac cycle (60 / hr) — drives loop speed. Recalculated each render off the current HR, so a future live HR (Phase 12) speeds/slows the trace automatically with no rework here. */
  cycleSeconds: number
  /** Live/starting pulse-pressure ratio, scaling trace height — defaults to 1 (no scaling). */
  amplitudeScale?: number
}

interface TileSpec {
  /** One cardiac cycle, starting and ending at the same y so repeated tiles join seamlessly. */
  path: string
  tileWidth: number
  viewHeight: number
}

const TILES: Record<WaveformProps['kind'], TileSpec> = {
  // Lead-II-style sinus beat: gentle P wave, flat PR segment, sharp QRS (Q dip, tall R
  // spike, S dip below baseline), flat ST segment, broader T wave, then a TP pause
  // before the next beat — not just a spike train.
  ecg: {
    path: 'M0,10 L6,10 Q8,7 10,10 L13,10 L14,12 L15,2 L16.5,16 L20,10 Q24,7 28,10 L40,10',
    tileWidth: 40,
    viewHeight: 20,
  },
  // Arterial line: rapid systolic upstroke to a peak, initial decline, a dicrotic notch
  // (aortic valve closure) with its small secondary wave, then a gradual diastolic
  // runoff back to the trough.
  art: {
    path: 'M0,15 C3,6 5,3 7,3 C9,3 10,7 11,10 C11.5,11.5 12.5,11.5 13,10 C13.5,8.5 14.5,8 16,9 C21,11.5 26,13.5 30,15',
    tileWidth: 30,
    viewHeight: 20,
  },
  // Photoplethysmogram: smoother/rounder than the arterial trace, a clear systolic
  // peak, a subtler dicrotic notch, and a longer, flatter decay to baseline.
  pleth: {
    path: 'M0,16 C2,10 3,4 5,3 C7,2 8,4 9,7 C9.5,9 10.5,10.5 11,10 C12,9 13,8.5 14,9.5 C18,12 22,14.5 24,16',
    tileWidth: 24,
    viewHeight: 20,
  },
}

/** Repeated tiles filling the viewBox — more than fit on screen, so the scroll never reveals a blank edge. */
const REPEATS = 5

/**
 * Continuously scrolling waveform trace, CSS-animated (no JS timers to leak or clean
 * up — see CLAUDE.md's engine-purity rule, kept out of engine/ entirely since this is
 * pure presentation). Each kind's path is one cardiac cycle tiled `REPEATS` times and
 * scrolled left by exactly one tile width per `cycleSeconds`, which loops seamlessly
 * since the tile's start/end points match.
 */
export function Waveform({ kind, color, cycleSeconds, amplitudeScale = 1 }: WaveformProps) {
  const { path, tileWidth, viewHeight } = TILES[kind]
  const animationName = `waveform-scroll-${kind}`

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${tileWidth * (REPEATS - 2)} ${viewHeight}`}
      className="mt-2 h-6 w-full overflow-hidden"
      preserveAspectRatio="none"
    >
      <style>{`
        @keyframes ${animationName} {
          from { transform: translateX(0); }
          to { transform: translateX(-${tileWidth}px); }
        }
      `}</style>
      <g style={{ transform: `scaleY(${amplitudeScale})`, transformOrigin: `0px ${viewHeight / 2}px` }}>
        <g style={{ animation: `${animationName} ${cycleSeconds}s linear infinite` }}>
          {Array.from({ length: REPEATS }, (_, i) => (
            <path
              key={i}
              d={path}
              transform={`translate(${i * tileWidth}, 0)`}
              fill="none"
              stroke={color}
              strokeWidth="1"
              opacity={0.85}
            />
          ))}
        </g>
      </g>
    </svg>
  )
}
