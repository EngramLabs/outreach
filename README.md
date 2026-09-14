# Outreach OS

A private, single-operator outreach management application. It tracks prospects,
companies, campaigns, and every outreach activity in one local database, and
derives the daily working queues (follow-ups, research, data quality) from that
data. It is not multi-user, does not send email or LinkedIn messages, and has no
public-facing surface. The operator records what they actually did; the app keeps
the state, dates, audit trail, and analytics consistent.

## Tech stack

| Layer         | Choice                                                        |
| ------------- | ------------------------------------------------------------- |
| Framework     | Next.js 16 (App Router), React 19                             |
| Language      | TypeScript (strict)                                           |
| UI            | Tailwind CSS 4 + shadcn/ui primitives, lucide-react icons     |
| Data          | Prisma 6 + SQLite (single file at `db/custom.db`)             |
| Server state  | TanStack Query 5 (staleTime 30s, retry 1)                     |
| UI state      | Zustand (view switching, drawers, shared dialogs)             |
| Validation    | Zod 4 (server-side schemas in `src/lib/validation.ts`)        |
| Fonts         | Geist Sans + Geist Mono                                       |
| Runtime       | Bun (dev server on port 3000)                                 |

## Local setup

```bash
bun install            # or: npm install

# .env at the project root:
# DATABASE_URL=file:/home/z/my-project/db/custom.db   (absolute path; SQLite file)
# AUTH_SECRET=<random string>                          (optional in dev — see SECURITY.md)

bun run db:push        # create/sync the SQLite schema (uses --accept-data-loss)
bun prisma/seed.ts     # seed sample fixtures + the login account
bun run dev            # http://localhost:3000
```

- `AUTH_SECRET` signs the session cookie. If unset, `src/lib/auth.ts` falls back
  to a hardcoded dev-only secret — fine locally, must be set for any real
  deployment. `DATABASE_URL` is the only required variable.
- The operator account is **not** an env var; it is seeded into the DB:
  `operator@outreach.local` / `outreach-2024` (demo credentials — see SECURITY.md).
- Seed contents: 13 companies (one deliberate duplicate pair), 3 campaigns,
  47 prospects, 93 activities, 3 saved views. This is development fixture data
  (`prisma/seed.ts`), including deliberately broken records that exercise the
  data-quality scanner.
- In this sandbox, external access goes through an internal gateway; the dev
  server itself binds port 3000.

## Scripts

| Command              | What it does                                                        |
| -------------------- | ------------------------------------------------------------------- |
| `bun run dev`        | Dev server on port 3000, logs tee'd to `dev.log`                    |
| `bun run build`      | Production build (standalone output)                                |
| `bun run start`      | Runs the standalone build with Bun (`server.log`)                   |
| `bun run lint`       | ESLint over the whole repo                                          |
| `bun run db:push`    | `prisma db push --accept-data-loss` — sync schema to SQLite         |
| `bun run db:generate`| `prisma generate` — (re)generate the Prisma client                  |
| `bun run db:migrate` | `prisma migrate dev` — create a migration (not used so far)         |
| `bun run db:reset`   | `prisma migrate reset`                                              |
| `bun prisma/seed.ts` | Seed fixtures. **There is no `db:seed` script in package.json** — run the seed file directly. |

## Daily use

1. Sign in at `/` (session lasts 14 days; login is rate-limited to 8 attempts/min).
2. Start in **Dashboard** (today's overdue/due follow-ups, acceptances, replies,
   research queue), or open the **Follow-Up Queue** directly — "Overdue + Today"
   is the default tab and the intended daily driver.
3. `⌘K` / `Ctrl+K` opens the command palette: grouped search results, Go-to
   section, and actions. The topbar search button is hidden on mobile, replaced
   by an icon button.
4. The sidebar has 11 sections: Dashboard, Prospects, Companies, Campaigns,
   Activities, Follow-Up Queue, Research Queue, Analytics, Data Quality,
   Archive, Settings. It is collapsible on desktop and a sheet on mobile; only
   Follow-Up Queue and Research Queue carry attention badges. A sticky status
   bar at the bottom shows live counts.
5. Keyboard notes: `Tab` from page start reveals a "Skip to content" link; the
   prospects table sorts via header buttons with `aria-sort`; icon-only buttons
   have labels; status changes and destructive actions are always confirm
   dialogs, never browser `alert()`.

## Data & backups

- **Exports** (Settings → Data & backups, or the Prospects toolbar):
  `/api/export?type=prospects` (honors current table filters; `&scope=all` for
  everything), `type=companies`, `type=campaigns`, `type=activities` (CSV), and
  `type=backup` — one JSON file containing prospects, companies, campaigns,
  activities, settings, and saved views.
- **SQLite file**: stop the dev server and copy `db/custom.db`. That file *is*
  the entire dataset.
- **Import**: Prospects → Import opens the wizard — parse/preview, column
  mapping, duplicate + invalid detection, then commit (2,000-row cap). Imports
  are create-only or gap-fill; existing values are never overwritten.
- Exports contain all CRM data — treat the files as sensitive.

## Environment constraints

- Only the `/` route is user-visible. All 11 sections are client views switched
  via a Zustand store (see `src/state/app-state.ts`) — there are no per-section
  URLs, and view state is not persisted.
- All data flows through JSON API route handlers under `src/app/api/**`. No
  React server actions are used.
- `src/app/api/route.ts` is an unused scaffold ("Hello, world!") left over from
  the starter — safe to delete.

## Documentation

- `PRODUCT.md` — what the app does and does not do, per-section inventory
- `DESIGN.md` — design tokens, density, states, accessibility, decision log
- `ARCHITECTURE.md` — layers, routing model, auth flow, automation rules
- `DATABASE.md` — schema, indexes, integrity rules, backup/restore
- `SECURITY.md` — auth, authorization, validation, known limits
- `QA.md` — what was verified (and how), what remains recommended
