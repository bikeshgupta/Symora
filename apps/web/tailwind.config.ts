// Design tokens: .claude/rules/design-system.md § Tailwind wiring.
import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          hover: 'rgb(var(--color-primary-hover) / <alpha-value>)',
          foreground: 'rgb(var(--color-primary-foreground) / <alpha-value>)',
        },
        background: 'rgb(var(--color-background) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          raised: 'rgb(var(--color-surface-raised) / <alpha-value>)',
        },
        border: 'rgb(var(--color-border) / <alpha-value>)',
        text: {
          primary: 'rgb(var(--color-text-primary) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
        },
        overdue: {
          DEFAULT: 'rgb(var(--color-overdue) / <alpha-value>)',
          surface: 'rgb(var(--color-overdue-surface) / <alpha-value>)',
        },
        'due-soon': {
          DEFAULT: 'rgb(var(--color-due-soon) / <alpha-value>)',
          surface: 'rgb(var(--color-due-soon-surface) / <alpha-value>)',
        },
        paid: {
          DEFAULT: 'rgb(var(--color-paid) / <alpha-value>)',
          surface: 'rgb(var(--color-paid-surface) / <alpha-value>)',
        },
        'neutral-status': {
          DEFAULT: 'rgb(var(--color-neutral-status) / <alpha-value>)',
          surface: 'rgb(var(--color-neutral-status-surface) / <alpha-value>)',
        },
        'focus-ring': 'rgb(var(--color-focus-ring) / <alpha-value>)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      spacing: {
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
        10: 'var(--space-10)',
        12: 'var(--space-12)',
        16: 'var(--space-16)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        numeric: 'var(--font-numeric)',
      },
      fontSize: {
        display: ['var(--text-display-size)', { lineHeight: 'var(--text-display-lh)', fontWeight: '600' }],
        title: ['var(--text-title-size)', { lineHeight: 'var(--text-title-lh)', fontWeight: '600' }],
        heading: ['var(--text-heading-size)', { lineHeight: 'var(--text-heading-lh)', fontWeight: '600' }],
        body: ['var(--text-body-size)', { lineHeight: 'var(--text-body-lh)', fontWeight: '400' }],
        'body-sm': ['var(--text-body-sm-size)', { lineHeight: 'var(--text-body-sm-lh)', fontWeight: '400' }],
        caption: ['var(--text-caption-size)', { lineHeight: 'var(--text-caption-lh)', fontWeight: '500' }],
        amount: ['var(--text-amount-size)', { lineHeight: 'var(--text-amount-lh)', fontWeight: '600' }],
      },
    },
  },
  plugins: [],
} satisfies Config;
