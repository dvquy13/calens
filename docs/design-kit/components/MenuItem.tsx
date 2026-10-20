'use client'

import { ChevronRight } from 'lucide-react'
import * as React from 'react'

import { cn } from '../lib/cn'

/**
 * MenuItem — a single row in a nav dropdown panel.
 *
 * Shape:    [40x40 icon square]  Title         ›
 *                                Description
 *
 * Hover: title shifts to brand-link, chevron slides in.
 */

type MenuItemProps = React.ComponentPropsWithoutRef<'a'> & {
  description?: string
  /** 24x24 SVG path string (`d=`), rendered inside a rounded 40x40 surface-200 tile */
  icon?: string
  hasChevron?: boolean
  hoverColor?: 'foreground' | 'brand'
}

export const MenuItem = React.forwardRef<HTMLAnchorElement, MenuItemProps>(
  (
    {
      className, title, href, description, icon, hasChevron, children,
      hoverColor = 'foreground', ...props
    },
    ref
  ) => (
    <a
      ref={ref}
      href={href}
      {...props}
      className={cn(
        'group/menu-item flex items-center gap-3 rounded-md p-2 leading-none no-underline select-none outline-none',
        'text-foreground-light hover:text-foreground',
        'focus-visible:ring-2 focus-visible:ring-foreground-lighter focus-visible:text-foreground',
        className
      )}
    >
      {children ?? (
        <>
          {icon && (
            <div className="shrink-0 border border-default bg-surface-200 w-10 h-10 flex items-center justify-center rounded-lg">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-5 w-5">
                <path d={icon} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              </svg>
            </div>
          )}
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-1">
              <p className={cn(
                'leading-snug text-foreground',
                hoverColor === 'brand' && 'group-hover/menu-item:text-brand-link'
              )}>
                {title}
              </p>
              {hasChevron && (
                <ChevronRight
                  strokeWidth={2}
                  className="w-3 h-3 text-foreground transition-all -translate-x-1 opacity-0 group-hover/menu-item:translate-x-0 group-hover/menu-item:opacity-100"
                />
              )}
            </div>
            {description && (
              <p className="line-clamp-2 leading-snug text-foreground-lighter group-hover/menu-item:text-foreground-light text-xs">
                {description}
              </p>
            )}
          </div>
        </>
      )}
    </a>
  )
)
MenuItem.displayName = 'MenuItem'
