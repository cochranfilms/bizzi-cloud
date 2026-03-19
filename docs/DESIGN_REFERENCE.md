# Bizzi Cloud Design Reference

Design tokens and patterns for building Figma files and maintaining visual consistency with the Bizzi Cloud web app.

---

## Typography

| Token | Font | Usage |
|-------|------|-------|
| **Sans** | Geist Sans | Body text, headings, UI labels |
| **Mono** | Geist Mono | Code, technical content |

**Source:** [Geist font](https://vercel.com/font) (Vercel). Use `geist` package or Google Fonts equivalent.

**Common sizes:**
- `text-xs` — 12px — Captions, metadata, secondary labels
- `text-sm` — 14px — Body text, buttons, form labels
- `text-base` — 16px — Default body
- `text-lg` — 18px — Section headings, modal titles
- `text-xl` — 20px — Page titles
- `text-2xl` — 24px — Hero, large headings

**Weights:** `font-medium` (500), `font-semibold` (600), `font-bold` (700)

---

## Colors

### Primary / Accent (Brand)

| Name | Hex | Usage |
|------|-----|-------|
| **Bizzi Blue** | `#00BFFF` | Primary accent, buttons, links, focus states |
| **Bizzi Cyan** | `#00D4FF` | Hover states, secondary accent |
| **Bizzi Navy** | `#1e3a5f` | Dark accent, headers |
| **Bizzi Sky** | `#e8f4fc` | Light accent backgrounds |

*Note: Accent colors are user-customizable on the dashboard. Use these as defaults.*

### Neutral Palette (Tailwind)

| Token | Light | Dark |
|-------|-------|------|
| 50 | `#fafafa` | — |
| 100 | `#f5f5f5` | — |
| 200 | `#e5e5e5` | — |
| 300 | `#d4d4d4` | — |
| 400 | `#a3a3a3` | — |
| 500 | `#737373` | — |
| 600 | `#525252` | — |
| 700 | `#404040` | — |
| 800 | `#262626` | — |
| 900 | `#171717` | — |
| 950 | `#0a0a0a` | — |

**Text colors:**
- Primary: `neutral-900` (light) / `white` (dark)
- Secondary: `neutral-600` (light) / `neutral-400` (dark)
- Muted: `neutral-500` (light) / `neutral-400` (dark)

### Dashboard Background Themes (10 options)

User-selectable. Each theme has light and dark variants:

| Name | Light | Dark |
|------|-------|------|
| White | `#ffffff` | `#0a0a0a` |
| Off-white | `#fafafa` | `#171717` |
| Cream | `#f5f0e8` | `#262626` |
| Warm beige | `#ebe6df` | `#1c1917` |
| Light gray | `#f0f0f0` | `#27272a` |
| Slate | `#f8fafc` | `#0f172a` |
| Stone | `#e7e5e4` | `#292524` |
| Neutral | `#f5f5f5` | `#171717` |
| Charcoal | `#404040` | `#2d2d2d` |
| Black | `#525252` | `#0a0a0a` |

### Gallery Background Themes (Client galleries)

| Name | Hex | Text tone |
|------|-----|-----------|
| White | `#ffffff` | dark |
| Off-white | `#fafafa` | dark |
| Cream | `#f5f0e8` | dark |
| Warm beige | `#ebe6df` | dark |
| Light gray | `#f0f0f0` | dark |
| Slate | `#f8fafc` | dark |
| Stone | `#e7e5e4` | dark |
| Neutral | `#f5f5f5` | dark |
| Charcoal | `#2d2d2d` | light |
| Black | `#0a0a0a` | light |

### Enterprise Themes (Org branding)

| Name | Primary | Accent |
|------|---------|--------|
| Bizzi | `#00BFFF` | `#00D4FF` |
| Slate | `#475569` | `#64748b` |
| Emerald | `#059669` | `#10b981` |
| Violet | `#7c3aed` | `#8b5cf6` |
| Amber | `#d97706` | `#f59e0b` |
| Rose | `#e11d48` | `#f43f5e` |
| Teal | `#0d9488` | `#14b8a6` |

---

## Spacing

Tailwind spacing scale (1 unit = 4px):

| Token | px | Usage |
|-------|-----|-------|
| 1 | 4 | Tight gaps |
| 2 | 8 | Icon gaps, small padding |
| 3 | 12 | Compact padding |
| 4 | 16 | Standard padding, gaps |
| 5 | 20 | Section spacing |
| 6 | 24 | Card padding |
| 8 | 32 | Large gaps |
| 10 | 40 | Section breaks |
| 12 | 48 | Major sections |
| 14 | 56 | Nav height |
| 16 | 64 | Hero spacing |

**Common patterns:**
- Card padding: `p-4` (16px) or `p-6` (24px)
- Modal padding: `p-4`
- Gap between elements: `gap-2` (8px), `gap-4` (16px)
- Section spacing: `space-y-4`, `space-y-5`, `space-y-6`

---

## Border Radius

| Token | px | Usage |
|-------|-----|-------|
| `rounded` | 4 | Small elements |
| `rounded-md` | 6 | Buttons, chips |
| `rounded-lg` | 8 | Inputs, cards |
| `rounded-xl` | 12 | Modals, large cards |
| `rounded-full` | 9999 | Avatars, pills |

---

## Shadows

- Cards/modals: `shadow-lg` (subtle elevation)
- Dropdowns: `shadow-lg` + `border border-neutral-200`
- Dark mode: borders use `neutral-700` instead of heavy shadows

---

## Touch Targets

- **Minimum tap target:** 44×44px (mobile)
- **Small target:** 40×40px (`touch-target-sm`)

---

## Breakpoints

| Name | Min width |
|------|-----------|
| sm | 640px |
| md | 768px |
| lg | 1024px |
| xl | 1280px |
| 2xl | 1536px |

---

## Dark Mode

- Toggle: `dark` class on `<html>`
- Backgrounds: `bg-neutral-100` (light) → `bg-neutral-950` (dark)
- Cards: `bg-white` (light) → `bg-neutral-900` (dark)
- Borders: `border-neutral-200` (light) → `border-neutral-700` (dark)
- Accent in dark: often `bizzi-cyan` for better contrast

---

## Component Patterns

- **Modals:** `max-w-md` (448px) or `max-w-lg` (512px), `rounded-xl`, `p-4`
- **Buttons:** `rounded-lg`, `px-4 py-2`, `text-sm font-medium`
- **Inputs:** `rounded-lg`, `px-4 py-2`, `border border-neutral-200`
- **Dropdowns:** `min-w-[200px]`, `rounded-lg`, `py-1`
- **Color swatches:** `h-8 w-8`, `rounded-full` or `rounded-lg`
