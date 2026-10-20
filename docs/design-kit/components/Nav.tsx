'use client'

import * as React from 'react'

import { Button } from './Button'
import { cn } from '../lib/cn'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from './NavigationMenu'

/**
 * Nav — the sticky translucent navbar.
 *
 * THREE-LAYER STRUCTURE (keeps compositing clean):
 *   1. Outer sticky div — `sticky top-0 z-40` with `translate3d(0,0,999px)`
 *      Forces a new compositing layer so backdrop-blur doesn't repaint on scroll.
 *   2. Background div (absolute) — separated from nav content so blur/opacity
 *      transitions don't affect children layout.
 *   3. Nav element (relative z-40) — holds the actual content above bg layer.
 *
 * SCROLL OPACITY — bg shifts from 70% → 95% opacity after 50px scroll.
 * Wire it up with a `scrolled` state + `onScroll` listener (see FlatNav below).
 *
 * FLAT NAV CHEVRON PATTERN (no dropdowns needed):
 * Each link uses `group/nav-item`. A `ChevronDown` icon sits before the label,
 * hidden at rest, slides in from above on hover:
 *
 *   className="group/nav-item flex items-center gap-1 ..."
 *   <ChevronDown className="w-3 h-3 transition-all will-change-transform
 *     -translate-y-1 opacity-0
 *     group-hover/nav-item:translate-y-0 group-hover/nav-item:opacity-100" />
 *
 * MOBILE MENU — full-screen overlay, `animate-in fade-in duration-200`.
 * Body scroll is locked while open (`document.body.style.overflow = 'hidden'`).
 * Auto-closes on resize ≥ 1024px and on Escape keydown.
 */

export type NavItem =
  | { kind: 'link'; title: string; href: string }
  | { kind: 'dropdown'; title: string; content: React.ReactNode }

type NavProps = {
  logo: React.ReactNode
  items: NavItem[]
  /** Right-side CTAs. Recommended: one neutral + one primary. */
  ctas?: React.ReactNode
  /** Show a left-side hamburger on mobile. Pass your own drawer via `mobileMenu`. */
  mobileMenu?: React.ReactNode
  sticky?: boolean
  className?: string
}

/** Full Nav — supports Radix dropdown menus. Use when you have mega-menus. */
export const Nav: React.FC<NavProps> = ({
  logo, items, ctas, mobileMenu, sticky = true, className,
}) => {
  return (
    <div
      className={cn(
        sticky ? 'sticky top-0 z-40' : 'relative',
        'transform',
        className
      )}
      style={{ transform: 'translate3d(0,0,999px)' }}
    >
      {/* translucent bg layer */}
      <div
        aria-hidden
        className="absolute inset-0 h-full w-full bg-[hsl(var(--background-default)/0.9)] dark:bg-[hsl(var(--background-default)/0.95)] transition-all duration-300"
      />
      <nav className="relative z-40 border-b border-default backdrop-blur-sm transition-all duration-300">
        <div className="relative flex h-16 mx-auto lg:container lg:px-16 xl:px-20">
          <div className="flex items-center px-6 lg:px-0 flex-1 justify-between">
            <div className="flex items-center">
              <div className="flex items-center flex-shrink-0">{logo}</div>

              <NavigationMenu
                delayDuration={0}
                className="hidden pl-8 lg:flex h-16 sm:space-x-4"
                viewportClassName="rounded-xl bg-background"
              >
                <NavigationMenuList>
                  {items.map((item) =>
                    item.kind === 'dropdown' ? (
                      <NavigationMenuItem key={item.title} className="text-sm font-medium">
                        <NavigationMenuTrigger
                          className={cn(
                            'px-2 h-auto py-2 rounded-md',
                            'text-foreground bg-transparent !bg-transparent',
                            'hover:text-brand-link',
                            'data-[state=open]:!text-brand-link'
                          )}
                        >
                          {item.title}
                        </NavigationMenuTrigger>
                        <NavigationMenuContent>{item.content}</NavigationMenuContent>
                      </NavigationMenuItem>
                    ) : (
                      <NavigationMenuItem key={item.title} className="text-sm font-medium">
                        <NavigationMenuLink asChild>
                          <a
                            href={item.href}
                            className="px-2 py-2 rounded-md inline-block text-foreground hover:text-brand-link focus-visible:text-brand-link"
                          >
                            {item.title}
                          </a>
                        </NavigationMenuLink>
                      </NavigationMenuItem>
                    )
                  )}
                </NavigationMenuList>
              </NavigationMenu>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden lg:flex items-center gap-2">{ctas}</div>
              {mobileMenu && <div className="lg:hidden">{mobileMenu}</div>}
            </div>
          </div>
        </div>
      </nav>
    </div>
  )
}

/**
 * FlatNav — scroll-aware nav for sites with flat links (no dropdowns).
 * Implements the full Calens pattern: scroll opacity, ChevronDown slide-in,
 * right-side CTA button, full-screen mobile overlay with body scroll lock.
 *
 * Usage:
 *   import { ChevronDown, Menu, X } from 'lucide-react'
 *   <FlatNav
 *     logo={<a href="/">Acme</a>}
 *     links={[
 *       { title: 'Features', onClick: () => scrollTo('features') },
 *       { title: 'Pricing',  onClick: () => scrollTo('pricing') },
 *       { title: 'Docs',     href: '/docs' },
 *     ]}
 *     cta={{ label: 'Get Started', href: '/signup' }}
 *   />
 */
export type FlatNavLink =
  | { title: string; href: string; onClick?: never }
  | { title: string; onClick: () => void; href?: never }

export const FlatNav: React.FC<{
  logo: React.ReactNode
  links: FlatNavLink[]
  cta?: { label: string; href: string }
}> = ({ logo, links, cta }) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  React.useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isMenuOpen])

  React.useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 1024) setIsMenuOpen(false) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="sticky top-0 z-40" style={{ transform: 'translate3d(0,0,999px)' }}>
      {/* Background layer — opacity shifts on scroll */}
      <div className={cn(
        'absolute inset-0 h-full w-full transition-all duration-300 backdrop-blur-sm',
        scrolled ? 'bg-background/95' : 'bg-background/70'
      )} />

      <nav className="relative z-40 border-b border-default transition-all duration-300">
        <div className="relative flex justify-between h-16 mx-auto lg:container lg:px-16 xl:px-20 px-6">
          {/* Left: logo + desktop links */}
          <div className="flex items-center gap-8">
            {logo}
            <div className="hidden lg:flex items-center gap-1">
              {links.map((link) => (
                <button
                  key={link.title}
                  onClick={link.onClick ?? (() => { window.location.href = link.href! })}
                  className="group/nav-item flex items-center gap-1 text-sm font-medium text-foreground-light hover:text-brand px-3 py-1.5 rounded-md transition-all"
                >
                  {/* ChevronDown slides in from above on hover */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg" width="12" height="12"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="transition-all will-change-transform -translate-y-1 opacity-0 group-hover/nav-item:translate-y-0 group-hover/nav-item:opacity-100"
                    aria-hidden
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                  {link.title}
                </button>
              ))}
            </div>
          </div>

          {/* Right: CTA + hamburger */}
          <div className="flex items-center gap-2">
            {cta && (
              <Button asChild size="small" className="hidden lg:flex">
                <a href={cta.href}>{cta.label}</a>
              </Button>
            )}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden p-2 text-foreground"
              aria-label="Toggle menu"
              aria-expanded={isMenuOpen}
            >
              {/* swap Menu / X icons from lucide-react */}
              {isMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile overlay — full-screen, fade-in, body scroll locked */}
      {isMenuOpen && (
        <div className="fixed inset-0 top-16 z-50 bg-background animate-in fade-in duration-200 lg:hidden">
          <div className="flex flex-col items-center gap-6 p-8 pt-12">
            {links.map((link) => (
              <button
                key={link.title}
                onClick={() => { link.onClick?.(); setIsMenuOpen(false) }}
                className="text-xl font-medium text-foreground-light hover:text-brand transition-colors"
              >
                {link.title}
              </button>
            ))}
            {cta && (
              <Button asChild size="large" className="mt-4 w-full max-w-xs">
                <a href={cta.href}>{cta.label}</a>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Default CTA pair — drop-in for the right side of the nav.
 * Always renders: neutral secondary (default hover), then brand-filled primary.
 *
 * The `default` button hover pattern used site-wide:
 *   hover:text-brand hover:border-brand hover:bg-alternative
 * This keeps background stable (no grey flash) while text + border animate to brand.
 */
export const NavCTAs: React.FC<{
  secondary?: { label: string; href: string }
  primary?:   { label: string; href: string }
}> = ({ secondary, primary }) => (
  <>
    {secondary && (
      <Button asChild type="default" size="small"
        className="hover:text-brand hover:border-brand hover:bg-alternative">
        <a href={secondary.href}>{secondary.label}</a>
      </Button>
    )}
    {primary && (
      <Button asChild size="small">
        <a href={primary.href}>{primary.label}</a>
      </Button>
    )}
  </>
)
