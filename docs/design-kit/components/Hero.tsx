import * as React from 'react'

import { Button } from './Button'
import { SectionContainer } from './SectionContainer'
import { cn } from '../lib/cn'

/**
 * Hero — centered, narrow, two-line headline.
 *
 * Use ONE line colored with `text-brand`; the other stays neutral.
 * This is the single focal point of the page. Resist the urge to ornament.
 *
 * Layout:
 *   [AnnouncementBadge?]
 *   h1 (2 lines, one neutral + one brand)
 *   p  body copy, foreground-light
 *   [Primary CTA] [Secondary CTA]
 *
 * The -mt-[65px] pulls the hero under the 64px sticky nav so the hero's top
 * pt-[90px] creates consistent breathing room below the blurred nav bar.
 */

type HeroProps = {
  announcement?: React.ReactNode
  headlineTop: React.ReactNode
  headlineBottom: React.ReactNode
  /** which of the two lines gets the brand color — default: bottom */
  brandLine?: 'top' | 'bottom'
  subhead?: React.ReactNode
  primary?: { label: string; href: string }
  secondary?: { label: string; href: string }
  className?: string
}

export const Hero: React.FC<HeroProps> = ({
  announcement, headlineTop, headlineBottom,
  brandLine = 'bottom', subhead, primary, secondary, className,
}) => (
  <div className={cn('relative -mt-[65px]', className)}>
    <SectionContainer className="pt-8 pb-10 md:pt-16 overflow-hidden">
      <div className="mx-auto max-w-2xl flex items-center justify-center text-center">
        <div
          className={cn(
            'relative z-10 flex flex-col items-center justify-center gap-4 lg:gap-8',
            'pt-[90px] lg:min-h-[300px]',
            'sm:mx-auto md:w-3/4 lg:mx-0 lg:w-full'
          )}
        >
          {announcement}
          <div className="flex flex-col items-center">
            <h1 className="text-foreground text-4xl sm:text-5xl sm:leading-none lg:text-7xl font-bold">
              <span className={cn('block', brandLine === 'top' ? 'text-brand' : 'text-foreground')}>
                {headlineTop}
              </span>
              <span className={cn('block', brandLine === 'bottom' ? 'text-brand' : 'text-foreground')}>
                {headlineBottom}
              </span>
            </h1>
            {subhead && (
              <p className="pt-2 mt-3 sm:mt-5 lg:mb-0 text-foreground-light text-sm sm:text-base lg:text-lg">
                {subhead}
              </p>
            )}
          </div>
          {(primary || secondary) && (
            <div className="flex items-center gap-2">
              {primary && (
                <Button asChild size="medium">
                  <a href={primary.href}>{primary.label}</a>
                </Button>
              )}
              {secondary && (
                <Button asChild size="medium" type="default">
                  <a href={secondary.href}>{secondary.label}</a>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </SectionContainer>
  </div>
)
