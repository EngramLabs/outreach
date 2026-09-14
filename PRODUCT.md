# PRODUCT.md

Product contract for Outreach OS. Describes what the app **is**, as built. For
how it is built see ARCHITECTURE.md / DATABASE.md; for what was tested see QA.md.

## Who uses it

One operator — a single person doing LinkedIn-first prospecting and outreach,
for themselves. There is exactly one account (seeded), no teams, no roles, no
tenant separation. Every screen is designed for that person's daily session:
open the app in the morning, work the queues, close it at night.

## The daily questions it answers

The app exists to answer, quickly and from real recorded data (spec §1):

- Who am I contacting? Why? At which company, in which campaign?
- What do I know about them, and what have I already done?
- What is the current status? When should I contact them next?
- Did they respond? What happened?
- Which campaigns are working?
- Which records still need verification?
- Which data is incomplete or duplicated?

It is an outreach **operating system**, not sales-force automation, not an email
marketing platform, not a generic CRM.

## Core workflows (as implemented)

- **Pipeline lifecycle**: research → verify → ready → request → connected →
  message → follow-up → reply → meeting → converted. 14 statuses in 6 semantic
  groups (`src/lib/constants.ts`). Logging an activity advances status
  automatically; status changes are always written to the activity audit trail.
- **Follow-up queue as daily driver**: derived live from each prospect's
  `nextFollowUpDate` — sections Overdue / Today / Tomorrow / This week /
  Upcoming / No date. Default tab is "Overdue + Today". Row actions: Complete,
  Complete & reschedule (shortcuts: today / tomorrow / 3 days / 1 week / custom),
  Reschedule, Skip (clears the date, logs a note), Open, Log activity.
- **Research → verification loop**: Research Queue tabs (Researching / Needs
  Verification / Verified / Ready / Rejected / All) with per-record expand panel
  (notes, angle, dates), field-level verification (name, job title, company,
  LinkedIn URL, email, location — each independently verified), "Move to Ready",
  and Reject with confirmation.
- **DQ repair loop**: Data Quality scans the live DB on demand — duplicate
  LinkedIn/email/people/companies, missing fields, invalid URLs, status/date
  mismatches, impossible dates. Each issue links to its fix (merge dialog,
  filtered prospect list, company view). Issues can be dismissed (persisted) and
  restored or reset.
- **CSV import loop**: file or paste → preview with per-header column mapping,
  duplicate + invalid row detection → options (create-only vs gap-fill update,
  campaign assign, source label) → transactional commit with result summary.
  Never overwrites existing values.
- **Merge**: pick the record to keep; activities move, target is gap-filled,
  source is deleted — all in one transaction.

## Data sources

- **Manual entry** — forms for prospects, companies, campaigns, activities.
- **CSV import** — dependency-free parser with mapping suggestions (2,000-row cap).
- **Referral links from LinkedIn** — the operator pastes profile/company URLs;
  the app normalizes and stores them.

**LinkedIn boundaries (spec §26)**: no automation, no scraping, no auto-sending.
The app records manual actions only — the operator remains responsible for
everything they do on LinkedIn. This is stated in Settings as well.

## Non-goals (deliberately not built, spec §64)

No multi-tenancy, billing, teams, roles, enterprise SSO, or permission systems.
No public API, webhooks, plugin marketplace, or workflow builder. No email
sending or email server. No calendar sync. No LinkedIn automation of any kind.
No drag-and-drop pipeline. The smallest serious system that solves the workflow.

## Real facts vs assumptions

**Real**: every number in the UI is computed from the local SQLite database —
dashboard counts, campaign stats (requests/acceptance rate, replies, meetings,
conversions), analytics, DQ issues. Nothing is mocked client-side; there is no
fake data in production code paths. Rates show an honest "—" when the
denominator is zero; analytics distributions are labeled as current snapshots
because the backend computes them un-range-limited.

**Fixtures (development seed)**: the seeded database contains realistic
sample records including deliberately broken ones (duplicate company, duplicate
LinkedIn URL, duplicate email, same-name person, malformed URL, impossible
dates) so the DQ scanner has something to find in development. `prisma/seed.ts`
is the only place sample data exists; the app never invents records at runtime.

**Assumptions** (from spec §63, recorded here):

- Single operator; data volume in the hundreds to a few thousand records (not
  100k+; informs the in-memory DQ scan and server-side pagination design).
- LinkedIn-first outreach (connection requests, messages) with email as a
  secondary channel — reflected in activity types and date fields.
- Local/private deployment; browser is a desktop-class device at least part of
  the time (mobile is supported, but density targets desktop).

## Feature inventory by section (11 views, all live)

| View | What it does |
| ---- | ------------ |
| **Dashboard** | Today tiles (overdue / due today / acceptances / replies / needs verification / research queue, clickable), pipeline status rows, 14-day activity SVG chart, recent acceptances/replies/added, performance summary, 12-item activity feed |
| **Prospects** | Full table: search + status-group/priority/campaign/company/verification/follow-up/tag/missing/issue filters, saved views (load/save/delete), column visibility, sorting (incl. priority rank), checkbox selection with bulk status/priority/campaign/archive/delete, export (current view or all), import trigger, add/edit form, detail drawer with quick actions, date ladder, activity timeline |
| **Companies** | Search + status filter + sort; compact table; detail sheet with links, notes, campaign chips, attached prospects, recent activities; delete guarded when prospects are attached |
| **Campaigns** | Status filter; rows with inline quick-status change; detail sheet with description/audience/dates, 3×3 stats grid (null rates as "—"), prospect list, recent activities; delete guarded when prospects are attached |
| **Activities** | Full audit log: type filter, inclusive from/to date filters, debounced search, pagination, per-row delete; "auto" tag on automation-written rows |
| **Follow-Up Queue** | Derived sections with counts; per-row Complete / Complete & reschedule / Reschedule / Skip / Open / Log activity; per-section and whole-queue empty states |
| **Research Queue** | Stage tabs with real counts; expandable rows with research notes/outreach angle; Verify, Move to Ready, Edit, Reject, Open |
| **Analytics** | Range selector (7d/30d/90d/this year/custom with validation); metric tiles; outreach funnel with step conversions; pipeline distribution; by-campaign and top-15 by-company tables with proportion bars; activity-over-time and prospects-added charts |
| **Data Quality** | Scan summary, ordered issue list with fix navigation, dismiss (high severity confirms), dismissed-issues section with per-issue restore, restore-all/reset |
| **Archive** | Search, count, compact table; bulk restore; per-row permanent delete with confirmation and consequences text |
| **Settings** | Operator info; preferences (default follow-up days 0–60, weekly connection target 0–500, LinkedIn checklist URL); exports; import entry point; SQLite backup note; LinkedIn boundaries statement; reset dismissed DQ issues |

## Operator preferences

Stored in the `Setting` table: `defaultFollowUpDays` (default 3),
`weeklyConnectionTarget` (default 40), `operatorName`, `linkedinChecklistUrl`.
The DQ dismissal list also lives there (`dq_dismissed`).
