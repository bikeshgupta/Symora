# Design system

The visual foundation. Phase 1 wires these tokens into Tailwind; Phase 6 builds the
trusted components on top of them. Read this before writing any UI.

## Direction

Warm, personal, approachable. Symora holds things the user is anxious about — money
that is due, promises they made — so the surface should feel calm and reassuring, not
like a financial dashboard. Rounded geometry, generous spacing, soft low-opacity
shadows, a warm neutral ground rather than cold grey. Violet is the brand and action
colour. Light and dark themes are both first-class from day one; neither is an
afterthought retrofitted later.

## Token architecture

Every colour is defined once as a CSS variable on `:root`, overridden on `.dark`, and
exposed through the Tailwind theme. Components reference **semantic tokens only**.

Colour tokens are stored as **space-separated RGB channels**, not hex. This is what
lets Tailwind's alpha modifiers work — `bg-primary/10` for a tint, `border-border/60`
for a hairline — from a single token. The hex equivalent is listed below for reading
convenience only; do not put hex in the CSS.

```css
--color-primary: 124 58 237;      /* used as rgb(var(--color-primary) / <alpha-value>) */
```

### Required semantic tokens

| Token | Meaning | Light | Dark |
| --- | --- | --- | --- |
| `--color-primary` | violet; action and brand | `124 58 237` · #7C3AED | `167 139 250` · #A78BFA |
| `--color-surface` | card background | `255 255 255` · #FFFFFF | `36 31 28` · #241F1C |
| `--color-background` | page background | `251 249 247` · #FBF9F7 | `26 22 20` · #1A1614 |
| `--color-border` | hairlines, dividers, card edges | `232 227 223` · #E8E3DF | `58 50 46` · #3A322E |
| `--color-text-primary` | body and headings | `42 35 32` · #2A2320 | `245 240 236` · #F5F0EC |
| `--color-text-muted` | secondary, captions, metadata | `107 98 89` · #6B6259 | `168 160 154` · #A8A09A |
| `--color-overdue` | something is late | `185 28 28` · #B91C1C | `248 113 113` · #F87171 |
| `--color-due-soon` | approaching, needs attention | `180 83 9` · #B45309 | `251 191 36` · #FBBF24 |
| `--color-paid` | settled, complete | `21 128 61` · #15803D | `74 222 128` · #4ADE80 |
| `--color-neutral-status` | not yet actionable | `95 88 82` · #5F5852 | `154 146 140` · #9A928C |

Note the light/dark inversion in the status colours: on light surfaces the status colour
is a **dark, saturated** shade because it is used as text on white; on dark surfaces it
is a **light** shade for the same reason. A status colour is never used as a large
filled background with the opposite text colour — always as text, icon, or a soft tint.

### Supporting tokens

These exist so that "never a raw palette value in JSX" is actually achievable — a
component needs a token for every colour it paints.

| Token | Purpose | Light | Dark |
| --- | --- | --- | --- |
| `--color-primary-hover` | pressed/hover action | `109 40 217` · #6D28D9 | `196 181 253` · #C4B5FD |
| `--color-primary-foreground` | text/icon on a primary fill | `255 255 255` · #FFFFFF | `26 22 20` · #1A1614 |
| `--color-surface-raised` | nested surface inside a card | `245 243 241` · #F5F3F1 | `46 40 37` · #2E2825 |
| `--color-overdue-surface` | soft tint behind overdue text | `254 242 242` · #FEF2F2 | `58 31 31` · #3A1F1F |
| `--color-due-soon-surface` | soft tint behind due-soon text | `255 251 235` · #FFFBEB | `58 46 23` · #3A2E17 |
| `--color-paid-surface` | soft tint behind paid text | `240 253 244` · #F0FDF4 | `22 48 31` · #16301F |
| `--color-neutral-status-surface` | soft tint behind neutral text | `245 243 241` · #F5F3F1 | `46 40 37` · #2E2825 |
| `--color-focus-ring` | keyboard focus ring | `124 58 237` · #7C3AED | `167 139 250` · #A78BFA |

Do not add a colour token without adding both its light and dark value and recording its
contrast ratio below.

## Contrast

Both themes are verified, and the status colours are verified against the **dark**
surface specifically — that is where a naive palette breaks. Target is WCAG AA: 4.5:1
for text, 3:1 for icons and boundaries. Measured against `--color-surface`:

| Token | Light on #FFFFFF | Dark on #241F1C |
| --- | --- | --- |
| `--color-text-primary` | 15.5:1 | 14.4:1 |
| `--color-text-muted` | 5.97:1 | 6.34:1 |
| `--color-primary` | 5.70:1 | 5.99:1 |
| `--color-overdue` | 6.47:1 | 5.90:1 |
| `--color-due-soon` | 5.02:1 | 9.77:1 |
| `--color-paid` | 5.02:1 | 9.36:1 |
| `--color-neutral-status` | 6.99:1 | 5.33:1 |

Status colour on its own tint surface (the badge case) also clears AA: overdue 5.91:1
light / 5.44:1 dark, due-soon 4.84:1 / ≥4.5:1, paid 4.78:1 / ≥4.5:1, neutral 6.32:1 /
4.74:1. `--color-primary-foreground` on a primary fill is 5.70:1 light and 6.60:1 dark.

Several of these sit near the 4.5:1 floor. **Re-measure before changing any status
colour**, in both themes, on both `--color-surface` and the matching tint. A change that
looks fine in light mode can fail in dark.

## Geometry

Generous and consistent. Nothing in the UI is sharp-cornered.

```css
--radius-sm: 8px;     /* badges, small inputs */
--radius-md: 12px;    /* buttons, inputs, list rows */
--radius-lg: 16px;    /* the standard card radius — all seven trusted components */
--radius-xl: 24px;    /* sheets, modals, the Ask Symora input container */
--radius-full: 9999px; /* SuggestionChip, avatars, pills */
```

Shadows are soft, low-opacity, and tinted with the warm near-black (`41 32 28`) rather
than pure black — a pure-black shadow on a warm ground reads as grey grime. Two layers:
a tight contact shadow plus a wide diffuse one. No hard drop shadows, no visible offset,
no dark borders masquerading as shadows.

```css
--shadow-sm: 0 1px 2px rgb(41 32 28 / 0.04), 0 1px 3px rgb(41 32 28 / 0.06);
--shadow-md: 0 2px 4px rgb(41 32 28 / 0.04), 0 4px 12px rgb(41 32 28 / 0.08);
--shadow-lg: 0 4px 8px rgb(41 32 28 / 0.04), 0 12px 28px rgb(41 32 28 / 0.10);
```

In dark mode shadows barely read. Elevation there comes from **surface lightness plus a
border**, not from a heavier shadow — `.dark` keeps the same shadow tokens at low opacity
and relies on `--color-surface` sitting above `--color-background`. Never darken shadows
in dark mode to compensate.

## Spacing

4px base unit, but the rhythm is deliberately airy. This is a calm assistant, not a
dense dashboard — when in doubt, add space.

```css
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
--space-5: 20px;  --space-6: 24px;  --space-8: 32px;  --space-10: 40px;
--space-12: 48px; --space-16: 64px;
```

Standing rhythm, applied consistently:

- Card padding: `--space-5` (20px) on mobile, `--space-6` (24px) from `sm` up
- Gap between stacked cards: `--space-4` (16px)
- Gap between page sections: `--space-8` (32px)
- Page gutter: `--space-4` mobile, `--space-6` tablet and up
- Gap between a label and its value: `--space-1`
- Minimum interactive target: 44×44px, always, including icon buttons

## Typography

### Family

The app mixes Latin and Devanagari inside a single sentence — Hinglish means "EMI ₹42,500
kal bhar diya" is one line. A Latin-only UI font with a system Devanagari fallback
produces a visible seam mid-sentence. So the primary family must cover both scripts
itself.

**Primary: Mukta** (Ek Type) — one superfamily covering Devanagari and Latin with shared
design and metrics, humanist and open, designed for UI text at small sizes. It carries
the warmth this direction needs without the geometric stiffness of Poppins.

```css
--font-sans: 'Mukta', 'Noto Sans Devanagari', 'Noto Sans',
             system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
--font-numeric: 'Mukta', ui-monospace, 'SF Mono', 'Roboto Mono', monospace;
```

The fallback order matters: `'Noto Sans Devanagari'` sits **before** `system-ui` on
purpose. Font fallback resolves per character, and `system-ui` on several Android and
Windows configurations has no Devanagari coverage — putting it first would let Latin
resolve to the system font while Devanagari fell through to something arbitrary, which
is exactly the seam we are avoiding.

Load weights 400, 500, 600, 700 only. Subset to **both** the `latin` and `devanagari`
unicode ranges — dropping the Devanagari subset to save bytes silently breaks Hindi
input. Use `font-display: swap` and preload the 400 and 600 weights.

Money and dates must align in columns. `--font-numeric` exists for that, applied with
`font-variant-numeric: tabular-nums`. **Phase 1 must verify that Mukta ships tabular
figures**; if it does not, amount columns use the monospace fallback in that stack rather
than losing alignment.

### Scale

One scale, defined once, reused everywhere. No ad-hoc font sizes in components.

| Token | Size / line-height | Weight | Use |
| --- | --- | --- | --- |
| `--text-display` | 30px / 38px | 600 | home greeting |
| `--text-title` | 22px / 32px | 600 | page and sheet titles |
| `--text-heading` | 18px / 28px | 600 | card titles |
| `--text-body` | 16px / 26px | 400 | default body |
| `--text-body-sm` | 14px / 22px | 400 | secondary text, list metadata |
| `--text-caption` | 13px / 20px | 500 | labels, status badges, timestamps |
| `--text-amount` | 20px / 28px | 600 | monetary amounts, tabular-nums |

Line heights are deliberately looser than a Latin-only UI would use. Devanagari stacks
matras above and below the base line; at 1.4 they collide with the line above. **1.6 is
the floor for body text** and is not negotiable for a tighter layout.

## Tailwind wiring — Phase 1 deliverable

`darkMode: 'class'`. Tokens are declared in the global stylesheet and mapped into the
theme so that `bg-surface`, `text-muted`, `border-border`, `rounded-lg`, `shadow-md`
resolve to tokens, and `bg-primary/10` still works.

```ts
// tailwind.config.ts
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
      },
      borderRadius: {
        sm: 'var(--radius-sm)', md: 'var(--radius-md)',
        lg: 'var(--radius-lg)', xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)',
      },
      fontFamily: { sans: 'var(--font-sans)', numeric: 'var(--font-numeric)' },
    },
  },
};
```

If Phase 1 lands on Tailwind v4, the same tokens go in an `@theme` block instead of a
config file — the token names and semantics do not change, only the wiring.

shadcn/ui components are generated then **edited to reference these tokens**. Do not keep
shadcn's default `--background` / `--foreground` / `--primary` naming as a parallel
system; there is one set of tokens.

## Theme switching

- Class-based: `.dark` on `<html>`.
- Three states, not two: `light`, `dark`, `system`. Default is `system`.
- A user override is persisted to `localStorage` under `symora-theme`. When the value is
  `system`, follow `prefers-color-scheme` live via a `matchMedia` listener — a user who
  never chose explicitly should follow their device when it switches at sunset.
- Resolve and apply the theme in a **blocking inline script in `index.html`, before first
  paint**. Applying it in a React effect produces a white flash for dark-mode users.

```html
<script>
  (function () {
    try {
      var s = localStorage.getItem('symora-theme');
      var dark = s === 'dark' || (s !== 'light' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    } catch (e) {}
  })();
</script>
```

Set `color-scheme` alongside the class so native form controls, scrollbars, and the
browser's own chrome match. Every new screen is checked in both themes before it is
considered done.

## Rules for the Phase 6 trusted components

Applies to `AttentionCard`, `PaymentSummary`, `CommitmentList`, `TaskList`,
`ConfirmationCard`, `MessageDraftCard`, and `SuggestionChip`.

**One card shell.** All seven are built on a single `CardShell` primitive: `--radius-lg`
corners, `--color-surface` background, a 1px `--color-border` edge, `--shadow-sm` at
rest, and the standard 20/24px padding rhythm. A component must not invent its own
radius, padding, or elevation. Consistency across the set is what makes the home screen
read as calm rather than assembled.

**Status is never colour alone.** Every status is communicated by colour **and** a text
label or icon — a red dot with no word is invisible to a colour-blind user and
meaningless in a screenshot. Overdue shows the overdue colour, a warning icon, and the
word (or "3 days late"). Paid shows the paid colour, a check, and "Paid". Due-soon shows
its colour, a clock, and the timeframe. Not-yet-actionable uses the neutral colour with
its own label. This is a hard requirement, not a preference — the status badge component
must make the text or icon non-optional in its props.

**`ConfirmationCard` is visually distinct.** It gates a high-impact write — a recurring
obligation, a payment marked paid, a deletion — and must never be mistakable for a
passive informational card. It carries a 2px `--color-primary` border (not the 1px
`--color-border` of every other card), `--shadow-lg`, a primary-tinted header strip, an
explicit question as its title, the parsed values shown verbatim as a labelled list, and
two clearly separated actions where confirm is a filled primary button and cancel is not.
Nothing else in the set is allowed to use a 2px primary border, so the treatment stays
unique to "this will change your data."

**`SuggestionChip`** is the one exception to the card shell: `--radius-full`, low
elevation, `--color-surface-raised` background. It is a passive suggestion and should
recede.

## Enforcement

- **No raw palette values in JSX.** `bg-violet-500`, `text-red-500`, `#7C3AED`, and
  `rgb(124 58 237)` are all forbidden in components. Only semantic token classes.
- Phase 1 adds a lint rule failing the build on Tailwind palette class names
  (`violet-`, `red-`, `amber-`, `green-`, `slate-`, `gray-`, `zinc-`, `stone-`, …) and on
  hex literals in `.tsx` files. Without the rule the convention erodes within a week.
- A new colour is added to this file first — both themes, contrast measured — and only
  then used.
- Respect `prefers-reduced-motion`: no non-essential transitions when it is set.
- Focus is always visible: a 2px `--color-focus-ring` outline with a 2px offset on every
  interactive element. Never `outline: none` without a replacement.
