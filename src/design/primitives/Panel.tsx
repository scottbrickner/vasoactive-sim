import { type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '../cn'

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Optional heading rendered in the panel header row. */
  title?: ReactNode
  /** Optional supporting text under the title. */
  subtitle?: ReactNode
  /** Optional actions aligned to the right of the header (e.g. a Button). */
  actions?: ReactNode
  /** Optional footer region. */
  footer?: ReactNode
  children?: ReactNode
}

/** Card surface for the app shell — title / body / optional footer. */
export function Panel({
  title,
  subtitle,
  actions,
  footer,
  className,
  children,
  ...props
}: PanelProps) {
  const hasHeader = title != null || subtitle != null || actions != null
  return (
    <section
      className={cn(
        'rounded-lg border border-border bg-surface shadow-sm',
        className,
      )}
      {...props}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title != null && (
              <h2 className="truncate text-lg font-semibold text-ink">{title}</h2>
            )}
            {subtitle != null && (
              <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
            )}
          </div>
          {actions != null && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      {children != null && <div className="px-5 py-4">{children}</div>}
      {footer != null && (
        <div className="border-t border-border px-5 py-3">{footer}</div>
      )}
    </section>
  )
}
