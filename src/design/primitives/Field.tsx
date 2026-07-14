import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../cn'

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode
  /** Helper text shown below the control. */
  help?: ReactNode
  /** Error message; when present the control is styled invalid and announced. */
  error?: ReactNode
  /**
   * Provide a custom control (e.g. a <select>) instead of the default <input>.
   * Receives the generated id + aria wiring so the label stays associated.
   */
  renderControl?: (props: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
  }) => ReactNode
}

const controlClasses =
  'h-10 w-full rounded-md border bg-surface px-3 text-base text-ink ' +
  'placeholder:text-muted/70 transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cardinal ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

/** Labeled form control for the app shell: label + control + help/error, WCAG-associated. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, help, error, renderControl, className, id, ...inputProps },
  ref,
) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const helpId = help != null ? `${fieldId}-help` : undefined
  const errorId = error != null ? `${fieldId}-error` : undefined
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        {label}
      </label>
      {renderControl ? (
        renderControl({
          id: fieldId,
          'aria-describedby': describedBy,
          'aria-invalid': error != null || undefined,
        })
      ) : (
        <input
          ref={ref}
          id={fieldId}
          aria-describedby={describedBy}
          aria-invalid={error != null || undefined}
          className={cn(controlClasses, error != null ? 'border-danger' : 'border-border')}
          {...inputProps}
        />
      )}
      {help != null && error == null && (
        <p id={helpId} className="text-sm text-muted">
          {help}
        </p>
      )}
      {error != null && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
})
