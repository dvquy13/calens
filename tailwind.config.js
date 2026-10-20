/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class", '[data-theme="dark"]'],
    content: [
    "./popup.html",
    "./homepage.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: ['Google Sans Flex', 'sans-serif'],
  			mono: ['Google Sans Code', 'Roboto Mono', 'monospace'],
  		},
  		colors: {
  			border: {
  				DEFAULT:  'hsl(var(--border-default) / <alpha-value>)',
  				muted:    'hsl(var(--border-muted) / <alpha-value>)',
  				strong:   'hsl(var(--border-strong) / <alpha-value>)',
  				stronger: 'hsl(var(--border-stronger) / <alpha-value>)',
  				overlay:  'hsl(var(--border-overlay) / <alpha-value>)',
  				control:  'hsl(var(--border-control) / <alpha-value>)',
  			},
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: {
  				DEFAULT:  'hsl(var(--foreground-default) / <alpha-value>)',
  				light:    'hsl(var(--foreground-light) / <alpha-value>)',
  				lighter:  'hsl(var(--foreground-lighter) / <alpha-value>)',
  				muted:    'hsl(var(--foreground-muted) / <alpha-value>)',
  				contrast: 'hsl(var(--foreground-contrast) / <alpha-value>)',
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))',
  				600: 'hsl(var(--destructive-600) / <alpha-value>)',
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			brand: {
  				DEFAULT: 'hsl(var(--brand-default) / <alpha-value>)',
  				link:    'hsl(var(--brand-link) / <alpha-value>)',
  				200:     'hsl(var(--brand-200) / <alpha-value>)',
  				300:     'hsl(var(--brand-300) / <alpha-value>)',
  				400:     'hsl(var(--brand-400) / <alpha-value>)',
  				500:     'hsl(var(--brand-500) / <alpha-value>)',
  				600:     'hsl(var(--brand-600) / <alpha-value>)',
  				dark:    'hsl(var(--brand-dark))',
  				light:   'hsl(var(--brand-light))',
  				lighter: 'hsl(var(--brand-lighter))',
  			},
  			surface: {
  				75:  'hsl(var(--background-surface-75) / <alpha-value>)',
  				100: 'hsl(var(--background-surface-100) / <alpha-value>)',
  				200: 'hsl(var(--background-surface-200) / <alpha-value>)',
  				300: 'hsl(var(--background-surface-300) / <alpha-value>)',
  			},
  		},
  		backgroundColor: {
  			background:  'hsl(var(--background-default) / <alpha-value>)',
  			alternative: 'hsl(var(--background-alternative-default) / <alpha-value>)',
  			selection:   'hsl(var(--background-selection) / <alpha-value>)',
  			control:     'hsl(var(--background-control) / <alpha-value>)',
  			overlay: {
  				DEFAULT: 'hsl(var(--background-overlay-default) / <alpha-value>)',
  				hover:   'hsl(var(--background-overlay-hover) / <alpha-value>)',
  			},
  		},
  		borderColor: {
  			DEFAULT:  'hsl(var(--border-default) / <alpha-value>)',
  			default:  'hsl(var(--border-default) / <alpha-value>)',
  			muted:    'hsl(var(--border-muted) / <alpha-value>)',
  			strong:   'hsl(var(--border-strong) / <alpha-value>)',
  			stronger: 'hsl(var(--border-stronger) / <alpha-value>)',
  			overlay:  'hsl(var(--border-overlay) / <alpha-value>)',
  			control:  'hsl(var(--border-control) / <alpha-value>)',
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
  		},
  		animation: {
  			'fade-in': 'fade-in 300ms ease-out both',
  		},
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
