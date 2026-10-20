import * as React from 'react'
import { cn } from '../lib/cn'

/**
 * SectionContainer — the single layout primitive every page section uses.
 *
 * Horizontal pad: 24px → 64px → 80px at lg/xl
 * Vertical pad:   64px → 96px from md up
 *
 * Don't override these. Visual variety comes from *content*, not padding.
 */
export const SectionContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    {...props}
    className={cn(
      'container relative mx-auto px-6 py-16 sm:py-20 md:py-24 lg:px-16 lg:py-24 xl:px-20',
      className
    )}
  >
    {children}
  </div>
))
SectionContainer.displayName = 'SectionContainer'
