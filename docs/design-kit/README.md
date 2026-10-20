# Design Kit

A compact, reusable landing-page kit distilled from the supabase.com source. Drop it into any React/Tailwind site and you get ~90% of the supabase look: semantic tokens, a sticky translucent nav with dropdown support, a two-line headline hero, a CTA banner.

**Current defaults in this build:**
- Theme: **light** (white background). Opt into dark via `.dark` or `[data-theme="dark"]` on `<html>`.
- Brand color: **Calens blue** `#0062a8` (hsl 205 100% 33%).
- Fonts: **Google Sans Flex** (sans) + **Google Sans Code** (mono) — both now in the public Google Fonts catalog, loaded via a single `<link>` tag. No local TTF needed.

Not a pixel-for-pixel clone. For that, fork `apps/www` whole. This kit is for the **structural** and **stylistic** decisions — accent discipline, typography scale, nav behavior, section rhythm — that make the supabase marketing pages feel coherent.

---

## What's in the box

```
design-kit/
├── README.md                    ← this file
├── tokens.css                   ← all CSS variables (dark + light + primitives)
├── tailwind.config.js           ← bridges tokens → tw utility classes
├── lib/
│   ├── cn.ts                    ← clsx + tailwind-merge helper
│   └── constants.ts             ← button size variants
└── components/
    ├── Button.tsx               ← 7 types × 5 sizes, cva-driven
    ├── NavigationMenu.tsx       ← radix wrapper (dropdown menus)
    ├── MenuItem.tsx             ← icon + title + description row
    ├── Nav.tsx                  ← sticky translucent navbar shell
    ├── SectionContainer.tsx     ← the only layout primitive you need
    ├── AnnouncementBadge.tsx    ← rounded pill above the hero headline
    ├── Hero.tsx                 ← centered two-line headline + CTA pair
    └── CTABanner.tsx            ← closing banner before footer
```

Every component is self-contained. No cross-imports from a shared `ui` package, no telemetry, no auth hooks, no Next.js coupling (uses plain `<a>`; swap for your router's Link as needed).

---

## Installing into a target project

### 1. Dependencies

```bash
npm i @radix-ui/react-navigation-menu @radix-ui/react-slot \
      class-variance-authority clsx tailwind-merge \
      lucide-react tailwindcss-animate
```

### 2. Copy the files

Copy `tokens.css`, `tailwind.config.js`, `lib/`, and `components/` into your project. Suggested layout:

```
src/
├── styles/tokens.css            ← from design-kit/tokens.css
├── lib/cn.ts                    ← from design-kit/lib/cn.ts
└── components/ui/               ← from design-kit/components/
```

### 3. Wire the tokens

In your app entry (or global CSS):

```css
@import './styles/tokens.css';
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 4. Merge the Tailwind config

If you already have a `tailwind.config.js`, either extend from this kit's config or merge the `theme.extend` block. The key pieces are the `textColor`, `backgroundColor`, `borderColor`, and `colors.brand` entries — those are what turn `text-foreground-light`, `bg-surface-100`, etc. into real classes.

### 5. Fonts

Both Google Sans Flex and Google Sans Code are in the public Google Fonts catalog. Add one `<link>` to your HTML `<head>` — no local font files needed:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Google+Sans+Code:wght@400;500&family=Google+Sans+Flex:wght@400..700&display=swap" rel="stylesheet" />
```

To swap fonts, edit `--font-sans` and `--font-mono` in `tokens.css`.

### 6. Rebrand

Change **only** the `--brand-*` variables in `tokens.css` (both the light and dark blocks). Everything else stays as-is and light/dark themes will still work.

Example — swap Calens blue (`#0062a8`, hsl 205 100% 33%) for Supabase green:

```css
:root, [data-theme="light"], .light {
  --brand-default: 153deg 60% 53%;
  --brand-link:    153deg 100% 37%;
  --brand-600:     157deg 87% 26%;
  --brand-500:     155deg 78% 40%;
  --brand-400:     151deg 67% 67%;
  --brand-300:     148deg 72% 80%;
  --brand-200:     148deg 73% 90%;
}
```

---

## Usage

### A full page

```tsx
import { Nav, NavCTAs }        from '@/components/ui/Nav'
import { Hero }                from '@/components/ui/Hero'
import { AnnouncementBadge }   from '@/components/ui/AnnouncementBadge'
import { CTABanner }           from '@/components/ui/CTABanner'
import { SectionContainer }    from '@/components/ui/SectionContainer'
import { MenuItem }            from '@/components/ui/MenuItem'

export default function Landing() {
  return (
    <>
      <Nav
        logo={<a href="/" className="font-semibold text-foreground">Acme</a>}
        items={[
          { kind: 'dropdown', title: 'Product', content: (
            <ul className="grid w-[420px] gap-1 p-4">
              <MenuItem href="/features"  title="Features"  description="Everything we do"
                icon="M4 6h16M4 12h16M4 18h16" hoverColor="brand" hasChevron />
              <MenuItem href="/changelog" title="Changelog" description="What's new"
                icon="M12 8v4l3 3" hoverColor="brand" hasChevron />
            </ul>
          )},
          { kind: 'link', title: 'Pricing', href: '/pricing' },
          { kind: 'link', title: 'Docs',    href: '/docs'    },
        ]}
        ctas={<NavCTAs
          secondary={{ label: 'Sign in',       href: '/login'  }}
          primary={{   label: 'Start free',    href: '/signup' }}
        />}
      />

      <Hero
        announcement={
          <AnnouncementBadge href="/launch" badge="NEW">
            Announcing our Series A
          </AnnouncementBadge>
        }
        headlineTop="Build in a weekend"
        headlineBottom="Scale to millions"
        brandLine="bottom"
        subhead="Everything you need to ship and scale, in one place."
        primary={{   label: 'Start free',    href: '/signup'      }}
        secondary={{ label: 'Request a demo', href: '/contact'    }}
      />

      <SectionContainer>
        {/* your feature grid, logos, testimonials, etc. */}
      </SectionContainer>

      <CTABanner
        headlineMuted="Build in a weekend,"
        headlineStrong="scale to millions"
        primary={{   label: 'Start free',    href: '/signup'  }}
        secondary={{ label: 'Request a demo', href: '/contact' }}
      />
    </>
  )
}
```

### `default` button hover pattern

All `type="default"` buttons on the landing page use a consistent hover that animates text + border to brand color without the background going grey:

```tsx
<Button type="default" size="large"
  className="hover:text-brand hover:border-brand hover:bg-alternative">
  See Features
</Button>
```

`hover:bg-alternative` neutralises the built-in `hover:bg-selection` from CVA so the background stays static. Apply this to every secondary CTA on marketing pages.

---

### Pricing card pattern (Supabase style)

Key structural decisions:
- Tier name in **UPPERCASE `font-mono`** (`text-xl font-normal uppercase`)
- Price in **large mono** (`font-mono text-5xl leading-none`)
- CTA button **inside each card**, above the price — not a single bottom button
- Highlighted card: `border-foreground-muted border-2 md:-my-4 z-10` (extends vertically, thicker border)
- Strikethrough original price stacked above the period, to the right of the large price:

```tsx
<div className="flex items-end gap-1.5">
  <p className="font-mono text-5xl text-foreground leading-none">{displayPrice}</p>
  <div className="flex flex-col items-start mb-0.5">
    {hasPromotion && (
      <span className="text-foreground-lighter text-xs line-through leading-tight">{originalPrice}</span>
    )}
    <span className="text-foreground-lighter text-[13px] leading-tight">{period}</span>
  </div>
</div>
```

- Badge (e.g. "Save 30%"): `bg-brand/10 border border-brand/30 text-brand-link rounded-md py-0.5 px-2 text-[11px]` — same palette as the `PromotionBanner`.
- Period values use a space after the slash: `/ month`, `/ year`, `one-time`.

---

### Accent-color rules of thumb

The single most important discipline inherited from supabase:

| Surface | Uses brand? |
|---|---|
| Primary CTA (filled) | **Yes — fill** |
| Secondary CTA | No (neutral outline) |
| Nav link idle | No |
| Nav link hover / open | **Yes — text only** |
| Hero headline | Half — one line brand, one line neutral |
| Body text | No |
| Section titles | No (size carries hierarchy) |
| Card borders & dividers | No |
| Icons in cards | No (brand only on CTAs or hover) |

If you can't say in one sentence why *this* pixel is brand-colored, it shouldn't be.

---

## Swapping `<a>` for your router

Every component uses plain `<a href>`. To use Next.js `Link`, react-router `<Link>`, etc., pass `asChild` on `Button` and wrap manually; or fork the 3–4 anchor call sites in `Nav.tsx`, `MenuItem.tsx`, `AnnouncementBadge.tsx`, `Hero.tsx`, `CTABanner.tsx`. Grep for `<a href` — it's under 10 occurrences.

Example with Next.js:

```tsx
import Link from 'next/link'

<Button asChild>
  <Link href="/signup">Start free</Link>
</Button>
```

---

## What's deliberately out of scope

- **Mobile menu drawer.** `Nav` accepts a `mobileMenu` slot; you bring your own. (Supabase's version has a full-height flyout with body-scroll locking — straightforward but project-specific.)
- **GitHub/auth buttons.** Substitute into `ctas`.
- **Scroll progress bar.** Easy to add; not structural.
- **Logos marquee, customer stories, product grid, dashboard features** — content sections vary too much per product to templatize. Build them inside `SectionContainer` using the tokens.
- **Typography plugin (prose).** Only needed for a blog; add `@tailwindcss/typography` and override `--tw-prose-*` in your config if/when you need it.

---

## Source map (for provenance / when you need more)

Every file in `components/` has a direct ancestor in the supabase repo:

| Kit file | Source |
|---|---|
| `tokens.css` | `packages/ui/build/css/themes/{dark,light}.css` + `source/global.css` |
| `tailwind.config.js` | `packages/config/tailwind.config.js` (hand-condensed) |
| `Button.tsx` | `packages/ui/src/components/Button/Button.tsx` |
| `NavigationMenu.tsx` | `packages/ui/src/components/shadcn/ui/navigation-menu.tsx` |
| `MenuItem.tsx` | `apps/www/components/Nav/MenuItem.tsx` |
| `Nav.tsx` | `apps/www/components/Nav/index.tsx` (telemetry + auth + launch-week stripped) |
| `SectionContainer.tsx` | `apps/www/components/Layouts/SectionContainer.tsx` |
| `AnnouncementBadge.tsx` | `apps/www/components/Announcement/Badge.tsx` |
| `Hero.tsx` | `apps/www/components/Hero/Hero.tsx` |
| `CTABanner.tsx` | `apps/www/components/CTABanner/index.tsx` |

Reference copy of `apps/www/` is at `docs/ext/supabase/` in this repo.
