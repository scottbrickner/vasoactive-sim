import { Button, Panel } from '../design/primitives'

export interface SubmitConfirmPanelProps {
  onConfirm: () => void
  onCancel: () => void
  /** Validation-mode framing — omit for a training-mode session ending only because charting is outstanding. */
  isGraded?: boolean
  /** Short, human-readable outstanding charting/verification items (see engine/documentation.ts's buildOutstandingChartingItems) — a soft warning, never a hard block. */
  outstandingItems?: string[]
}

/**
 * Confirmation on "End & go to debrief" — fires in two (non-exclusive) cases: (1)
 * validation mode, where ending is a graded submission, not just a way to see the
 * scorecard; (2) any mode, when documentation/verification items are still outstanding
 * (see Simulation.tsx's handleEndClick) — a soft warning naming what's outstanding, never
 * a hard block, matching this sim's non-punitive design. Training mode with nothing
 * outstanding is unaffected (fires immediately, no panel at all).
 */
export function SubmitConfirmPanel({ onConfirm, onCancel, isGraded, outstandingItems }: SubmitConfirmPanelProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-ink/40 p-4">
      <Panel
        role="alertdialog"
        aria-label={isGraded ? 'Submit for grading' : 'End session'}
        className="w-full max-w-md border-cardinal/40 ring-2 ring-cardinal/20"
        title={isGraded ? 'Submit for grading?' : 'End session?'}
      >
        {isGraded && (
          <p className="text-sm text-muted">
            This is a validation session — ending now submits it for grading. You won't be able to
            make further changes after this point.
          </p>
        )}
        {outstandingItems && outstandingItems.length > 0 && (
          <div className={isGraded ? 'mt-3' : ''}>
            <p className="text-sm font-medium text-ink">Still outstanding:</p>
            <ul className="mt-1 flex flex-col gap-1">
              {outstandingItems.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-muted">
                  <span aria-hidden="true" className="mt-0.5 text-warning">
                    !
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 flex gap-3">
          <Button onClick={onConfirm}>{isGraded ? 'Submit for grading' : 'Confirm and continue'}</Button>
          <Button variant="ghost" onClick={onCancel}>
            Keep going
          </Button>
        </div>
      </Panel>
    </div>
  )
}
