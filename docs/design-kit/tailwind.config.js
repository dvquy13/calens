/**
 * Design Kit — Tailwind config
 *
 * Bridges the CSS variables in `tokens.css` to Tailwind utility classes.
 * After this, you can write `bg-surface-100`, `text-foreground-light`,
 * `border-default`, `text-brand`, `outline-border-strong`, etc.
 *
 * Design note: all nested tokens (brand, foreground, surface, border, status)
 * live under `colors`, so they resolve through EVERY utility that falls back
 * to theme('colors') — text, bg, border, outline, ring, gradient stops, fill.
 * The type-specific overrides (backgroundColor, borderColor) only exist for
 * *flat-name* tokens like `bg-alternative` or `border-default` that don't fit
 * a nested structure.
 */

const hsl = (v) => `hsl(var(${v}) / <alpha-value>)`

module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: hsl('--brand-default'),
          link:    hsl('--brand-link'),
          200:     hsl('--brand-200'),
          300:     hsl('--brand-300'),
          400:     hsl('--brand-400'),
          500:     hsl('--brand-500'),
          600:     hsl('--brand-600'),
        },
        foreground: {
          DEFAULT:  hsl('--foreground-default'),
          light:    hsl('--foreground-light'),
          lighter:  hsl('--foreground-lighter'),
          muted:    hsl('--foreground-muted'),
          contrast: hsl('--foreground-contrast'),
        },
        surface: {
          75:  hsl('--background-surface-75'),
          100: hsl('--background-surface-100'),
          200: hsl('--background-surface-200'),
          300: hsl('--background-surface-300'),
        },
        border: {
          DEFAULT:  hsl('--border-default'),
          muted:    hsl('--border-muted'),
          strong:   hsl('--border-strong'),
          stronger: hsl('--border-stronger'),
          overlay:  hsl('--border-overlay'),
          control:  hsl('--border-control'),
        },
        warning:     { DEFAULT: hsl('--warning-default') },
        destructive: {
          DEFAULT: hsl('--destructive-default'),
          600:     hsl('--destructive-600'),
        },
      },

      // Flat-name aliases for common bg utilities.
      // backgroundColor defaults to theme('colors'), so `bg-brand`, `bg-surface-100`,
      // `bg-foreground` etc. already work via the colors block above.
      backgroundColor: {
        background:  hsl('--background-default'),
        alternative: hsl('--background-alternative-default'),
        muted:       hsl('--background-muted'),
        selection:   hsl('--background-selection'),
        control:     hsl('--background-control'),
        overlay: {
          DEFAULT: hsl('--background-overlay-default'),
          hover:   hsl('--background-overlay-hover'),
        },
      },

      // Flat-name aliases for border utilities.
      // Lets `border-default` / `border-strong` read nicely; nested keys
      // (border-brand, border-foreground-muted) still resolve via colors.
      borderColor: {
        DEFAULT:  hsl('--border-default'),
        default:  hsl('--border-default'),
        muted:    hsl('--border-muted'),
        strong:   hsl('--border-strong'),
        stronger: hsl('--border-stronger'),
        overlay:  hsl('--border-overlay'),
        control:  hsl('--border-control'),
      },

      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },

      keyframes: {
        'fade-in':        { from: { opacity: 0 }, to: { opacity: 1 } },
        'accordion-down': { from: { height: 0 }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up':   { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: 0 } },
      },
      animation: {
        'fade-in':        'fade-in 300ms ease-out both',
        'accordion-down': 'accordion-down 0.15s ease-out',
        'accordion-up':   'accordion-up 0.15s ease-out',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
}
