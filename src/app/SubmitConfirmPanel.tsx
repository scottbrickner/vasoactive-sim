import { Button, Panel } from '../design/primitives'

export interface SubmitConfirmPanelProps {
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Validation-mode-only confirmation on "End & go to debrief" — ending the session in
 * validation mode is a graded submission, not just a way to see the scorecard, so it
 * gets one explicit confirm step rather than a separate dedicated submission screen.
 * Training mode's "End & go to debrief" is unaffected (fires immediately).
 */
export function SubmitConfirmPanel({ onConfirm, onCancel }: SubmitConfirmPanelProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-ink/40 p-4">
      <Panel
        role="alertdialog"
        aria-label="Submit for grading"
        className="w-full max-w-md border-cardinal/40 ring-2 ring-cardinal/20"
        title="Submit for grading?"
      >
        <p className="text-sm text-muted">
          This is a validation session — ending now submits it for grading. You won't be able to
          make further changes after this point.
        </p>
        <div className="mt-4 flex gap-3">
          <Button onClick={onConfirm}>Submit for grading</Button>
          <Button variant="ghost" onClick={onCancel}>
            Keep going
          </Button>
        </div>
      </Panel>
    </div>
  )
}
