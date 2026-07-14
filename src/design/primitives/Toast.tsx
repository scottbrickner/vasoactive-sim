import { type ReactNode } from 'react'
import { cn } from '../cn'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

export interface ToastProps {
  tone?: ToastTone
  title?: ReactNode
  children?: ReactNode
  /** When provided, renders a dismiss control. */
  onDismiss?: () => void
  className?: string
}

/** Icon + word label per tone so meaning never relies on color alone (WCAG AA). */
const toneMeta: Record<
  ToastTone,
  { label: string; wrap: string; icon: string; iconColor: string; role: 'status' | 'alert' }
> = {
  info: {
    label: 'Info',
    wrap: 'bg-info/8 border-info/30 text-ink',
    icon: 'ℹ',
    iconColor: 'bg-info text-white',
    role: 'status',
  },
  success: {
    label: 'Good',
    wrap: 'bg-success/8 border-success/30 text-ink',
    icon: '✓',
    iconColor: 'bg-success text-white',
    role: 'status',
  },
  warning: {
    label: 'Heads up',
    wrap: 'bg-gold-soft border-gold-dark/40 text-ink',
    icon: '!',
    iconColor: 'bg-warning text-white',
    role: 'status',
  },
  danger: {
    label: 'Stop',
    wrap: 'bg-danger/8 border-danger/30 text-ink',
    icon: '×',
    iconColor: 'bg-danger text-white',
    role: 'alert',
  },
}

/**
 * Coaching surface for the friendly shell — an inline card, never a wall of red text.
 * Non-punitive by design: warnings use warm gold, meaning is carried by icon + label.
 */
export function Toast({ tone = 'info', title, children, onDismiss, className }: ToastProps) {
  const meta = toneMeta[tone]
  return (
    <div
      role={meta.role}
      className={cn('flex gap-3 rounded-md border px-4 py-3 shadow-sm', meta.wrap, className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          meta.iconColor,
        )}
      >
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        {title != null ? (
          <p className="font-semibold text-ink">
            <span className="sr-only">{meta.label}: </span>
            {title}
          </p>
        ) : (
          <span className="sr-only">{meta.label}: </span>
        )}
        {children != null && (
          <div className={cn('text-sm text-muted', title != null && 'mt-0.5')}>{children}</div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="mt-0.5 size-5 shrink-0 rounded text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cardinal"
        >
          ×
        </button>
      )}
    </div>
  )
}
