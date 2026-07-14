import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
  'transition-colors duration-150 select-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cardinal ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-cardinal text-white hover:bg-cardinal-dark active:bg-cardinal-dark',
  secondary:
    'bg-gold-soft text-cardinal-dark border border-gold-dark/40 hover:bg-gold/60 active:bg-gold/70',
  ghost: 'bg-transparent text-cardinal hover:bg-cardinal/8 active:bg-cardinal/12',
  danger: 'bg-danger text-white hover:brightness-95 active:brightness-90',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-base',
  lg: 'h-12 px-6 text-lg',
}

/** Branded shell button. Not for device screens (those get faithful replicas later). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', type = 'button', className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  )
})
