import * as React from 'react'

import { Button } from './Button'
import { cn } from '../lib/cn'

/**
 * CTABanner — the closing banner before the footer.
 *
 * Two layout variants:
 *
 * `centered` (default) — headline + subhead centered, single primary CTA below.
 * Clean, focused. Use when you have one clear action (e.g. "Add to Chrome").
 *
 * `split` — headline left, CTA pair right (`lg:flex-row justify-between`).
 * Use when you want a secondary action alongside the primary.
 *
 * No border-t/border-b on this component — let the surrounding layout decide
 * whether to add dividers (the Calens landing page has none here).
 */

type Props = {
  headline: React.ReactNode
  subhead?: React.ReactNode
  primary?: { label: string; href?: string; onClick?: () => void }
  secondary?: { label: string; href?: string; onClick?: () => void }
  /** centered (default) stacks everything; split puts headline + CTAs side by side */
  layout?: 'centered' | 'split'
  className?: string
}

export const CTABanner: React.FC<Props> = ({
  headline, subhead, primary, secondary, layout = 'centered', className,
}) => {
  const isCentered = layout === 'centered'

  return (
    <section className={cn('max-w-7xl mx-auto px-6 py-24 lg:px-16 xl:px-20', className)}>
      <div className={cn(
        'flex gap-6',
        isCentered
          ? 'flex-col items-center text-center'
          : 'flex-col lg:flex-row items-center justify-between'
      )}>
        <div className={isCentered ? 'flex flex-col items-center gap-2' : undefined}>
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground">{headline}</h2>
          {subhead && (
            <p className="text-foreground-light text-sm max-w-md">{subhead}</p>
          )}
        </div>

        <div className={cn('flex gap-3 flex-wrap', isCentered && 'justify-center')}>
          {primary && (
            <Button
              asChild={!!primary.href}
              size="large"
              onClick={primary.onClick}
            >
              {primary.href
                ? <a href={primary.href}>{primary.label}</a>
                : <span>{primary.label}</span>}
            </Button>
          )}
          {secondary && (
            <Button
              asChild={!!secondary.href}
              size="large"
              type="default"
              className="hover:text-brand hover:border-brand hover:bg-alternative"
              onClick={secondary.onClick}
            >
              {secondary.href
                ? <a href={secondary.href}>{secondary.label}</a>
                : <span>{secondary.label}</span>}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
