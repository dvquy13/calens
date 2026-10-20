import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cloneElement, forwardRef, isValidElement } from 'react'

import { cn } from '@/lib/utils'

const SIZE_VARIANTS = {
  tiny:   'text-xs px-2.5 py-1 h-[26px]',
  small:  'text-sm px-3 py-1.5 h-[30px]',
  medium: 'text-sm px-4 py-2 h-[38px]',
  large:  'text-sm px-5 py-2.5 h-[42px]',
  xlarge: 'text-base px-6 py-3 h-[48px]',
} as const
const SIZE_VARIANTS_DEFAULT = 'medium' as const

export type ButtonVariantProps = VariantProps<typeof buttonVariants>

const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center',
    'cursor-pointer text-center font-medium',
    'rounded-md border outline-none',
    'transition-all duration-200 ease-out',
    'focus-visible:outline-4 focus-visible:outline-offset-1',
    'gap-2',
  ].join(' '),
  {
    variants: {
      type: {
        primary: [
          'bg-brand hover:bg-brand-link',
          'text-foreground-contrast',
          'border-brand/75 hover:border-brand-link',
          'focus-visible:outline-brand',
        ].join(' '),
        default: [
          'text-foreground',
          'bg-alternative hover:bg-selection',
          'border-strong hover:border-stronger',
          'focus-visible:outline-brand-600',
        ].join(' '),
        outline: [
          'text-foreground bg-transparent',
          'border-strong hover:border-foreground-muted',
          'focus-visible:outline-border-strong',
        ].join(' '),
        text: [
          'text-foreground shadow-none',
          'border-transparent bg-transparent',
          'hover:bg-surface-300',
          'focus-visible:outline-border-strong',
        ].join(' '),
        link: [
          'text-brand-600 border-transparent bg-transparent shadow-none',
          'hover:bg-brand-400',
          'focus-visible:outline-border-strong',
        ].join(' '),
        destructive: [
          'text-foreground',
          'bg-destructive-600/20 hover:bg-destructive-600/30',
          'border-destructive/60 hover:border-destructive',
          'focus-visible:outline-destructive',
        ].join(' '),
      },
      size: SIZE_VARIANTS,
      block:    { true: 'w-full' },
      rounded:  { true: 'rounded-full' },
      disabled: { true: 'opacity-50 cursor-not-allowed pointer-events-none' },
    },
    defaultVariants: { type: 'primary', size: SIZE_VARIANTS_DEFAULT },
  }
)

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'disabled'>,
    Omit<ButtonVariantProps, 'disabled'> {
  asChild?: boolean
  disabled?: boolean
  htmlType?: React.ButtonHTMLAttributes<HTMLButtonElement>['type']
  loading?: boolean
  icon?: React.ReactNode
  iconRight?: React.ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      asChild = false,
      size = SIZE_VARIANTS_DEFAULT,
      type = 'primary',
      children, loading, block, rounded, icon, iconRight,
      htmlType = 'button',
      className, ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button'
    const disabled = loading === true || props.disabled
    const leftIcon = loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon

    const content = (
      <>
        {leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
        {children && <span className="truncate">{children}</span>}
        {iconRight && !loading && <span className="inline-flex shrink-0">{iconRight}</span>}
      </>
    )

    return (
      <Comp
        ref={ref as React.Ref<HTMLButtonElement>}
        type={htmlType}
        {...props}
        disabled={disabled}
        className={cn(buttonVariants({ type, size, block, rounded, disabled }), className)}
      >
        {asChild && isValidElement(children)
          ? cloneElement(children as React.ReactElement, undefined,
              leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>,
              (children as React.ReactElement).props.children && (
                <span className="truncate">{(children as React.ReactElement).props.children}</span>
              ),
              iconRight && !loading && <span className="inline-flex shrink-0">{iconRight}</span>
            )
          : content}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { buttonVariants }
