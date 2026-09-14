# QA.md

Quality record for Outreach OS. This file separates **verified** (a worklog
entry documents the check and its result) from **recommended** (not executed —
do not assume it works). Nothing here is aspirational.

## Manual browser QA — executed

All checks below ran against the running dev server (port 3000) with the
seeded database, in-browser and/or via direct API calls as noted. Task IDs
refer to worklog entries.

| # | Check | How it was verified | Task |
| - | ----- | -------------------- | ---- |
| 1 | Login screen renders logged-out; shell renders logged-in | `GET /` returns 200 in both states (login screen without session, shell with) | 3 |
| 2 | Sign-in via the UI | Logged in through the browser with seeded credentials | 4-b |
| 3 | **Prospects view renders** (table, filters, saved views, drawer) | Render verified via orchestrator integration check (GET / 200, lint/tsc clean) + consumed a live preset filter from Data Quality ("Missing: company") in-browser | 4-a, 4-d |
| 4 | **Companies view** — table, search, detail sheet, links | In-browser: search debounce ("berlin" → 1 row), empty state, detail sheet; stats values cross-checked against the API | 4-b |
| 5 | **Campaigns view** — rows, detail sheet, quick status | In-browser: both detail sheets opened, stats vs API, inline quick status change with toast + invalidation, mobile 390px no overflow | 4-b |
| 6 | **Dashboard renders** with live data | In-browser: tiles, pipeline, SVG chart (token colors via computed styles), feeds | 4-d |
| 7 | **Analytics renders**; range switching incl. custom dates | In-browser: 7d/30d/90d/this-year/custom with validation; charts and distribution bars | 4-d |
| 8 | **Data Quality view** — scan, dismiss/restore/reset, merge | In-browser: issue list with fix navigation; dismiss → dismissed section → per-issue restore → reset-all, all with toasts; merge dialog opened with the seeded duplicate pair | 4-d |
| 9 | **Follow-Up Queue renders** — sections, counts, row actions | In-browser: tabs/counts/sections/row actions/popovers/table behaviors | 4-c |
| 10 | **Research Queue renders** — stage tabs, expand panels | In-browser: tabs with counts, expand toggle, per-stage states | 4-c |
| 11 | **Activities view renders** — audit table, pagination | In-browser: table, type filter E2E (7 "Reply Received" rows; Clear filters resets), pagination | 4-c |
| 12 | Follow-up complete + reschedule E2E | Executed via the API: `completeAndReschedule` returned the effects array, follow-up count incremented, status automation fired; prospect + test activities restored to seed state afterward | 4-c |
| 13 | Activity automation fill-only dates | Executed via the API: logging activities fills empty lifecycle dates only, never overwrites | 2 |
| 14 | Preset navigation (cross-view filters) | E2E in-browser: dashboard pipeline row → prospects status filter; DQ fix → filtered prospect list; by-company → prospects companyId preset | 4-d |
| 15 | Mobile 390px | Dashboard/analytics/prospects verified; a horizontal overflow from grid min-size vs nowrap badges was found and fixed (`min-w-0`); campaigns had no overflow, companies table scrolls by design | 4-b, 4-d |
| 16 | Error handling | ErrorState retry verified in-browser on transient dev-server churn; destructive confirm dialogs show affected counts + consequences | 4-d |

**Archive and Settings**: verified at the API level (Task 4-e — `/api/archive`
shape with 2 seeded records, bulk restore round-trip then re-archive, settings
GET/PATCH partial payloads, DQ reset, `/api/export?type=backup` 200, GET / 200,
lint/tsc clean). The in-browser render pass of these two views was deferred
("belongs to Task 6") and no such pass is logged — see Recommended below.

## API smoke tests — executed

Via curl against the seeded DB (Task 2, re-seeded afterward): login, prospects
list with filters, dashboard, followups queue, data-quality scan (detected every
seeded scenario: dup linkedin/email/person/company, missing fields, invalid
URL, status/date mismatches, impossible dates), grouped search, activity
automation, follow-up actions, verification. Later additions (Task 4-c/4-e):
follow-up `completeAndReschedule` effects, activities type filter, archive
list/restore, settings PATCH, export backup, campaigns PATCH round-trip after
the validation fix (Task 4-a).

## Automated checks

- `bun run lint` — **clean, exit 0** (verified again while writing this
  documentation; also reported clean at the end of Tasks 2, 4-a–4-e).
- `bunx tsc --noEmit` — **zero errors in `src/` and `prisma/`** (re-verified for
  this doc). 4 pre-existing errors remain in `examples/websocket/` (missing
  socket.io types) and `skills/image-edit`, `skills/stock-analysis-skill` —
  starter-repo folders outside the application; they were never touched.
- No automated unit-test suite exists; the spec's testing scope (§52: auth,
  CRUD, automation, CSV, DQ, search, states, destructive actions) was covered
  by the API smoke tests and browser QA documented above (§53).

## Responsive

**Verified**: 390px width on dashboard, analytics, prospects (overflow fix
applied), campaigns (no overflow), companies (table scrolls horizontally — by
design), follow-ups/actions (mobile "…" dropdown). **Recommended**: a full
320px and 768px/tablet pass, and the mobile sheet navigation flow.

## Accessibility

**Implemented practices** (code-level, not audited): skip-to-content link;
`aria-sort` on sortable table headers; `aria-label`s on icon-only buttons;
`aria-expanded` on expand toggles; badge labels always visible (color is never
the sole indicator); `role="img"` + `aria-label` + per-bar `<title>` on SVG
charts; `aria-hidden` decorative icons; focus-visible ring styling;
`prefers-reduced-motion` honored globally.

**Not formally audited**: no screen-reader pass, no keyboard-only pass, and no
automated contrast/axe scan have been run. Treat "WCAG 2.2 AA intent" as
implemented-by-practice, not verified.

## Recommended checks (NOT executed — do before relying on)

1. **Import wizard full E2E with a real CSV file** (file → preview → mapping →
   options → commit → result summary). Only the backend stages were smoke-tested.
2. **Browser-level bulk archive → restore round trip** using table checkboxes
   and confirm dialogs (API-level bulk restore round-trip was executed, Task 4-e).
3. **In-browser pass of Archive and Settings views** (API-verified only).
4. **Keyboard-only navigation pass** across all 11 views (Tab/Enter/Escape,
   dialog focus traps, command palette).
5. **Screen-reader pass** on dashboard, prospects table, follow-up queue.
6. **2,000-record performance check** (import cap + list pagination + DQ scan
   timing) — current dataset is the 47-prospect fixture set.
7. **320px and 768px responsive pass.**
8. Rate-limit behavior (9th login attempt within a minute → 429) — implemented,
   never triggered in QA.

## Issues found during QA (all resolved)

- PATCH endpoints wiped omitted optional fields (zod transforms mapped
  `undefined` → null); fixed in `validation.ts`, verified by campaigns PATCH
  round-trip; clients additionally send full payloads on quick-status changes
  (Tasks 4-b, 4-a).
- Mobile 390px horizontal overflow on dashboard/analytics grid items; fixed
  with `min-w-0` (Task 4-d).
- Dev server was OOM-killed once during parallel-agent browser QA and once
  SIGTERM'd; restarted each time — environment event, not an app defect
  (Tasks 4-b, 4-c).
