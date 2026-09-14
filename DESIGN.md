# DESIGN.md

Design contract for Outreach OS. The token source of truth is
`src/app/globals.css`; this file explains the decisions behind it.

## Visual direction

A **focused, quiet, precise, practical, slightly technical operator workbench**
(spec §4): the tool the operator opens every morning. Hierarchy comes from
typography, spacing, alignment, grouping, contrast, and density — not from big
cards, shadows, gradients, or decorative elements.

**Anti-slop stance (spec §3), summarized**: every visual decision must have a
product reason (workflow, hierarchy, usability, identity, a11y, performance,
density). "Modern/premium/common in SaaS" is not a reason. The rule is not
beige-brutalism either — it is *make a deliberate choice, document it, apply it
consistently*. Concretely: no gradient or glass surfaces, no neon glow, no
pill-badge spam, no emoji icons, no scroll-triggered animation, no fake data.
The only radius, shadow, and motion values in use are the ones listed below.

## Color system

All colors are OKLCH CSS variables in `globals.css`, consumed only via Tailwind
token classes (`bg-card`, `text-muted-foreground`, `text-primary`, …). Raw hex
or ad-hoc Tailwind palette colors are not used in views.

| Token (light)            | Value                    | Meaning                          |
| ------------------------ | ------------------------ | -------------------------------- |
| `--background`           | `oklch(0.982 0.003 95)`  | page — warm paper neutral        |
| `--card` / `--popover`   | `oklch(1 0 0)`           | raised surface                   |
| `--surface-subtle`       | `oklch(0.958 0.004 95)`  | inset panels, kbd, code          |
| `--border` / `-strong`   | `0.905` / `0.855` (gray) | 1px separation                   |
| `--primary`              | `oklch(0.44 0.085 155)`  | deep pine green — key actions    |
| `--success` / `--warning` / `--danger` / `--info` | green 152 / amber 70 / red 27 / slate 200 | semantic states |
| `--tone-*-bg/fg`         | (below)                  | status badge tone groups         |

- **Dark mode is designed separately, not inverted** (`.dark` block): deeper
  green-cast charcoal (`--background oklch(0.212 0.005 160)`), brighter primary
  `oklch(0.72 0.11 155)` with dark foreground text, and elevation re-tuned
  (subtle surfaces go *darker* than cards, not lighter). Chart and tone tokens
  are re-specified for dark, not derived.
- **No blue/indigo anywhere.** Reason: green is the accent identity
  ("proceed/growth" for an outreach tool) and `--info` is a desaturated slate —
  avoiding the default-framework blue look was an explicit anti-slop decision.
  Color is always semantic; nothing is colored "because the area looked empty".
- **Status tone groups** (`StatusBadge` in `src/components/shared/status-badge.tsx`;
  the label is always rendered, color never carries meaning alone):

| Class              | Statuses                                             | Semantic meaning                  |
| ------------------ | ---------------------------------------------------- | --------------------------------- |
| `.tone-research`   | Researching, Needs Verification                      | early pipeline, neutral           |
| `.tone-ready`      | Verified, Ready                                      | cleared for outreach, green       |
| `.tone-active`     | Request Sent, Connected, Messaged, Follow-Up         | outreach in flight, amber         |
| `.tone-responding` | Replied, Meeting, Converted                          | positive response, strong green   |
| `.tone-negative`   | Not Interested, No Response                          | closed-negative, red              |
| `.tone-archived`   | Archived                                             | dormant, muted                    |

  Verification badges reuse the same tones (Verified→ready, Partial→active,
  Unverified→research); activity-type and DQ-severity badges map onto the same
  six groups. 14 statuses therefore never produce 15 random colors.
- Charts use `--chart-1..5` (green family + amber + red, harmonized), verified
  against computed styles during QA.

## Typography

**Geist Sans** for UI, **Geist Mono** for numerals/URLs/identifiers — a
deliberate technical pairing, loaded in `src/app/layout.tsx`. `.font-num`
applies Geist Mono with `tabular-nums` so columns of numbers align.

| Role            | Spec (as implemented)                       |
| --------------- | ------------------------------------------- |
| Page title      | topbar `h1` — 15px, semibold, tracking-tight |
| Section header  | 14px (`text-sm`) semibold + 13px description |
| Body            | 13px                                        |
| Metadata/hints  | 11–12px, muted foreground                   |
| Table cells     | 13px; numbers/dates in `.font-num`          |
| Stat value      | `.font-num text-xl` semibold, tabular       |
| Badges          | 11px medium                                 |

No marketing-scale headings exist anywhere in operational screens.

## Spacing & density

Density is a hierarchy signal: working data is dense, configuration is calm.

- Tables: compact rows (`h-9`/`h-10`; follow-up queue rows `h-11`), borders
  between rows instead of card wrappers, column-label header rows.
- Cards/panels: `p-3`/`p-4`; gaps `gap-3`/`gap-4` (Tailwind 3/4 units).
- Forms and Settings: single `max-w-2xl` column, `gap-8` between sections —
  generous where the operator is typing, not scanning.
- Main content maxes at `max-w-[1440px]`; topbar is a slim `h-12` sticky bar
  (no hero section, ever).

## Radii

`--radius: 0.5rem` (8px base). Tailwind utilities then produce: `rounded-md`
= 6px (buttons, inputs, cards, sheets), `rounded-sm` = 4px (all badges; their
status dot is a 6px square with a 2px radius). Small radii read as "technical
tool"; there are no pill badges and no uniform mega-rounding.

## Elevation

Flat surfaces separated by 1px borders (`--border` / `--border-strong`) — the
workbench look. Shadows are reserved for layers that truly float: dialogs,
sheets, popovers, dropdowns, the command menu. Sidebar/topbar/status-bar use
borders, not shadow stacks.

## Motion

Near zero. What exists: color/border transitions on hover and press
(`transition-colors`), and component-level enter/exit for overlays
(`tw-animate-css`). No scroll-triggered animation, no fade-up, no scale-on-hover.
`prefers-reduced-motion: reduce` collapses all animation/transition durations to
0.01ms (globals.css) — behavior, never decoration, drives motion.

## Component inventory

- **Primitives** (`src/components/ui/`): the shadcn/ui set (button, dialog,
  sheet, select, table, dropdown, popover, tabs, tooltip, …) styled via the
  tokens above. Only the subset actually used is referenced by the app.
- **Shared** (`src/components/shared/`): `StatusBadge` / `PriorityBadge` /
  `VerificationBadge` / `ActivityTypeBadge` / `DQSeverityBadge`; `states`
  (EmptyState, ErrorState, Stat, SectionHeader, TableSkeleton, CardsSkeleton);
  `date-label` (DateLabel, DueDateLabel with overdue emphasis); `confirm-dialog`
  (with affected count + consequences text); `timeline` (day-grouped activity
  list).
- **Forms** (`src/components/forms/`): prospect (grouped fieldsets, company
  combobox with create-new), company, campaign, activity (prospect picker),
  verify (field-level checkboxes), merge dialog.
- **Layout** (`src/components/layout/`): app-shell, sidebar (collapsible +
  mobile sheet), topbar, command menu, status bar, login screen.
- **Views** (`src/components/views/`): 11 view modules + prospect drawer +
  import wizard, imported and switched by `app-shell.tsx`.

## States

Every async area implements all three states (a build contract, enforced in
review): **loading** — `TableSkeleton` (tables) / `CardsSkeleton` /
per-section skeletons (Settings, detail sheets); **empty** — actionable copy,
e.g. "No companies yet" vs "No match for these filters" (search-aware variants),
follow-up queue per-section explanations (incl. why "no date" exists);
**error** — `ErrorState` with a retry button (verified working on transient
dev-server churn) and the server's human-readable error message. Mutations
surface success/failure via sonner toasts, never `alert()`.

## Responsive behavior

- **Navigation**: sidebar becomes a mobile `Sheet`; topbar collapses the search
  trigger to an icon button and the "Add" label to an icon.
- **Tables**: columns hidden below `md` (job title/company/notes etc.); true
  data tables scroll horizontally in an `overflow-x-auto` + `.scroll-slim`
  container (thin 8px scrollbar) — horizontal scroll is allowed for data tables
  only, never for page layout. The dashboard/analytics 390px overflow bug was
  fixed with `min-w-0` on grid columns (Task 4-d).
- **Rows → actions**: follow-up row actions collapse into a "…" dropdown on
  mobile driving the same dialogs; campaign rows stack below `md`.
- **Touch targets**: rows are the tap surface — `h-10`/`h-11` (40–44px) with
  the primary action (name button) filling the row. Desktop icon buttons are
  intentionally denser (`size-7`/`size-8`, 28–32px); on mobile, follow-up row
  actions collapse into one "…" dropdown button instead of a row of small
  targets.

## Accessibility rules

Implemented practices (WCAG 2.2 AA intent; see QA.md for audit status):

- Color is never the only indicator — badges always render the label and add a
  `title`; charts carry `role="img"` + `aria-label` and per-bar `<title>`.
- Keyboard: "Skip to content" link (first focusable element, `app-shell.tsx`);
  sortable tables use real buttons with `aria-sort`; focus-visible ring styles
  come from the token system (`outline-ring/50` base + shadcn ring utilities).
- Icon-only buttons have `aria-label`s throughout (row actions, link buttons,
  delete); expand toggles set `aria-expanded`; decorative icons are `aria-hidden`.
- `prefers-reduced-motion` respected (see Motion).
- Contrast: token pairs were chosen as fg/bg couples; no mid-gray-on-gray text
  beyond the muted tokens.

## Design decision log

| # | Decision | Reason | Alternative considered |
| - | -------- | ------ | ---------------------- |
| 1 | One restrained pine-green accent (`--primary`) for actions; everything else neutral | Private operational tool — color budget belongs to action/state hierarchy, not identity decoration | Framework-default blue/indigo accent (rejected: default look); multi-hue accent system |
| 2 | Compact table-first layout, 13px cells, `h-10` rows | The operator scans dozens of records per session; vertical density is the workflow | Card grids (rejected: fewer records per screen, more decoration) |
| 3 | Hand-rolled SVG charts (bar, polyline+area) with token colors | Only three small charts exist (dashboard volume, analytics activity-over-time and prospects-added); token-driven, ResizeObserver-measured, ~0 dependency cost; recharts is installed but unused in views | A chart library (rejected: bundle weight + default styling to fight) |
| 4 | Prospect detail as a drawer (Sheet) + detail sheets for companies/campaigns, not pages | Environment allows only one route; peeking a record without losing table context is the actual interaction | Separate detail routes (impossible: single `/` route constraint) |
| 5 | Follow-up queue derived from `Prospect.nextFollowUpDate`, no `follow_ups` table | Single source of truth; queue updates automatically from prospect data (spec §16); avoids date duplication and drift | Separate follow_ups rows (spec §31 listed it; rejected as redundant state — see DATABASE.md) |
| 6 | Geist Sans + Geist Mono with `.font-num` tabular numerals | Technical workbench identity; aligned number columns in dense tables | Inter/system stack (rejected: default look, weaker numeral alignment) |
