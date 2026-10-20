import { ChevronRight } from 'lucide-react'
import * as React from 'react'
import { cn } from '../lib/cn'

/**
 * AnnouncementBadge — the small rounded pill above the hero headline.
 * Neutral surface, hairline border, subtle gradient overlay, tiny chevron.
 */

type Props = {
  href: string
  children: React.ReactNode
  /** Short label rendered inline before the message; e.g. "NEW" */
  badge?: React.ReactNode
  target?: '_self' | '_blank'
  className?: string
  hasArrow?: boolean
}

export const AnnouncementBadge: React.FC<Props> = ({
  href, children, badge, target = '_self', className, hasArrow = true,
}) => (
  <div className={cn('relative w-fit max-w-xl flex justify-center', className)}>
    <a
      href={href}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      className={cn(
        'group/announcement relative flex flex-row items-center gap-1.5',
        'p-1 pr-1.5 text-sm text-nowrap text-left w-auto',
        'rounded-full border border-default hover:border-foreground-muted/30',
        'shadow-md overflow-hidden',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:rounded-full',
        !badge && 'pl-4'
      )}
    >
      {badge && (
        <span className="inline-flex items-center rounded-full bg-brand-500/20 text-brand-link text-[11px] font-medium px-2 py-0.5 border border-brand-500/40">
          {badge}
        </span>
      )}
      <span className="text-foreground line-clamp-1 w-full">{children}</span>
      {hasArrow && (
        <ChevronRight className="h-4 w-4 ml-1 -translate-x-1 text-foreground transition-transform group-hover/announcement:translate-x-0" />
      )}
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 -z-10 overflow-hidden rounded-full',
          'bg-gradient-to-br from-surface-100 to-surface-300',
          'opacity-70 group-hover/announcement:opacity-100 transition-opacity backdrop-blur-md'
        )}
      />
    </a>
  </div>
)
