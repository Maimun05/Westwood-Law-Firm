# Westwood Law Firm

Public marketing site and client portal for Westwood Law Firm (San Juan City, Philippines).

One React app serves two audiences: visitors browsing practice areas, lawyers and insights, and
signed-in clients, lawyers and administrators working inside the portal.

---

## Stack

| Layer        | Choice                                                                     |
| ------------ | -------------------------------------------------------------------------- |
| UI           | React 19 + TypeScript                                                      |
| Build        | Vite 8 (rolldown)                                                          |
| Styling      | Tailwind CSS 4 via `@tailwindcss/vite`                                     |
| Backend      | Supabase — Auth, Postgres with row-level security, Storage, Edge Functions |
| Spreadsheets | `xlsx` for portal exports                                                  |
| Formatting   | `oxfmt`, pinned to an exact version — see [Gotchas](#gotchas)              |
| Hosting      | Vercel (static build)                                                      |

The package manager is **npm**. `package-lock.json` is authoritative and CI runs `npm ci`.

---

## Quick start

```bash
npm install
```

Create `.env` in the repo root (it is gitignored) with the two values the client needs:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Then:

```bash
npm run dev               # http://localhost:5173
```

Both variables are read in `src/lib/supabase.ts` and `src/lib/auth.ts`. The anon key is safe to
expose to the browser — row-level security is what protects the data.

### Scripts

| Command           | What it does                                                    |
| ----------------- | --------------------------------------------------------------- |
| `npm run dev`     | Vite dev server on port 5173 (`strictPort`)                     |
| `npm run build`   | Production build into `dist/`                                   |
| `npm run preview` | Serve the built output on port 4173                             |
| `npm run format`  | Format with `oxfmt`. Add `-- --check` to verify without writing |

Type checking is not wired to a script — run `npx tsc --noEmit`.

There is **no test script**. CI calls `npm test --if-present`, which is a no-op. See
[Testing](#testing).

---

## Project structure

```
src/
  App.tsx              page switch + History API routing
  components/          one file per page, plus shared chrome
    portal/            portal panels (admin intake, matters, documents, content manager)
  hooks/               useAuth, useNotifications
  lib/
    auth.ts            session handling, sign-in/up, password reset
    supabase.ts        the single Supabase client
    routes.ts          URL <-> page mapping and per-page query params
    firm.ts            public contact address
    content.ts         content types + loaders
    fallbackContent.ts content used when the database is unreachable
    services/          data access per domain (admin, audit, documents, ...)
  types/               shared TypeScript types
supabase/
  migrations/          ordered SQL migrations — the source of truth for the schema
  functions/           Edge Functions (Deno)
  tests/               SQL probes for RLS and advisor checks
docs/diagrams/         system flow, ERD, DFD, architecture
scripts/               local Postgres validation, live probes, diagram rendering
```

---

## Routes

The app is a single-page app with real URLs driven by the History API (`src/lib/routes.ts`).
`vercel.json` rewrites every path to `index.html` so deep links work.

| Path                                  | Page                                        |
| ------------------------------------- | ------------------------------------------- |
| `/`                                   | Home                                        |
| `/about`                              | About the firm                              |
| `/expertise`                          | Practice areas (`?area=`)                   |
| `/lawyers`                            | Lawyer directory (`?lawyer=`)               |
| `/specialists`                        | Partner network                             |
| `/insights-resources`                 | Articles (`?article=`)                      |
| `/contact`                            | Contact                                     |
| `/inquiry`                            | Client inquiry flow (`?lawyer=`, `?area=`)  |
| `/consultation`                       | Consultation booking (`?lawyer=`, `?area=`) |
| `/portal`                             | Client / lawyer / admin portal              |
| `/auth`                               | Sign in, register (`?mode=`)                |
| `/forgot-password`, `/reset-password` | Password recovery                           |

Query parameters are whitelisted per page, so a stale `?lawyer=…` does not leak into the next page.

---

## Access model

Three roles live on `profiles.role`: **`client`**, **`lawyer`**, **`admin`**.

- Visitors browse everything public and can submit an inquiry.
- A signed-out inquiry is emailed straight to the firm (see `notify-inquiry` below) and is **not**
  shown in the admin intake queue.
- Client intake lists only inquiries tied to a registered client.
- Clients see their own matters, documents, appointments and messages.
- Lawyers see the matters assigned to them.
- Admins manage users, content, matters and the inquiry queue.

Row-level security is the enforcement point, not the UI. Policies are defined across the
`20260918_fix_all_rls_policies`, `20261001_consolidated_access_control` and
`20261005_security_advisor_fixes` migrations.

---

## Backend

### Migrations

`supabase/migrations/` is the source of truth, applied in filename order. Notable ones:

| Migration                                  | Purpose                                |
| ------------------------------------------ | -------------------------------------- |
| `20260916_*`                               | soft-delete support, audit log table   |
| `20260918_*`                               | content tables, RLS policy fixes       |
| `20260919_seed_content.sql`                | seeds practice areas, lawyers, FAQs    |
| `20260929_*`                               | documents and notifications            |
| `20261001_consolidated_access_control.sql` | consolidated roles and policies        |
| `20261003_integrity_hardening.sql`         | constraints and invariants             |
| `20261004_client_messaging.sql`            | client <-> firm messaging              |
| `20261005_security_advisor_fixes.sql`      | fixes from Supabase's security advisor |
| `20261006_public_inquiry_rpc.sql`          | RPC used by the public inquiry form    |
| `20261007_content_table_grants.sql`        | grants for the content tables          |

`supabase/APPLY_PENDING_MIGRATIONS.sql` is a concatenation of the pending set, for applying through
the dashboard SQL editor in one paste. Regenerate it with `node scripts/build-apply-pending.mjs`.

### Edge Functions

| Function            | Purpose                                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notify-inquiry`    | Emails a signed-out visitor's inquiry to the firm via Resend. Claims the row first (`firm_notified_at`) so a retry cannot double-send, and releases the claim if the send fails. |
| `admin-create-user` | Creates a user account server-side with the service-role key, so no admin credentials touch the browser.                                                                         |
| `admin-delete-user` | Permanently deletes an auth account (profile rows cascade).                                                                                                                      |

Deploy them with the Supabase CLI:

```bash
supabase functions deploy notify-inquiry --project-ref <ref>
supabase secrets set RESEND_API_KEY=<key> --project-ref <ref>
```

`notify-inquiry` needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY`.

### Local Supabase

`supabase/config.toml` defines the local stack: API 54321, Postgres 54322, Studio 54323, mail
catcher 54324, Postgres major version 17.

`scripts/local-pg-validate.sh` runs the migrations against a real Postgres and re-runs them to prove
idempotency. Use it before handing over any migration — several bugs in this project only surfaced
when the SQL was actually executed.

---

## Deployment

The site deploys to Vercel as a static build.

**Vercel project:** `westwood-law-firm` — production URL <https://westwood-law-firm.vercel.app>

`vercel.json` sets the build command, `dist` as the output directory, the SPA rewrite, and immutable
caching for `/assets/*` (safe because asset filenames are content-hashed).

### Deploying today

The Vercel project is **not connected to this GitHub repo**, so pushing does not deploy. Deploy from
a linked working copy:

```bash
vercel link --project westwood-law-firm     # once
vercel build --prod
vercel deploy --prebuilt --prod
```

The project holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in its environment settings for
Production and Preview, so `vercel build` picks them up.

### Optional: deploy from CI instead

`.github/workflows/ci.yml` already contains `deploy-production` and `deploy-preview` jobs. They are
skipped while `VERCEL_TOKEN` is unset. To enable them, add these repository secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Connecting the repo to the Vercel project in **Settings → Git** is the other route, and would make
every push to `main` deploy automatically.

---

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and `develop`, and on PRs to `main`:

| Job                  | Steps                                                     |
| -------------------- | --------------------------------------------------------- |
| `lint-and-typecheck` | `npm ci`, `npx tsc --noEmit`, `npm run format -- --check` |
| `test`               | `npm ci`, `npm test --if-present` (no-op today)           |
| `build`              | `npm ci`, `npm run build`, uploads `dist/` as an artifact |
| `deploy-preview`     | PRs only; skipped without `VERCEL_TOKEN`                  |
| `deploy-production`  | pushes to `main`; skipped without `VERCEL_TOKEN`          |
| `supabase-deploy`    | disabled (`if: false`); migrations are applied manually   |

CI runs on Node 20. `.mise.toml` pins Node 22 for local work.

---

## Gotchas

These four have each caused real breakage. Every one is also commented at its source.

### 1. Keep `resolve.dedupe` in `vite.config.ts`

```ts
resolve: { dedupe: ["react", "react-dom"], alias: { "@": ... } }
```

Without it, a rolldown bug (Vite 8 on Windows, seen through 8.3.2) bundles React **twice** when the
`@` alias is configured: `react-dom` and `main.tsx` get one copy, every other module gets another.
The app dies at boot with `Cannot read properties of null (reading 'useState')` because the second
copy's hook dispatcher is never set. The dev server works fine, so this only appears in a production
build — always smoke-test `dist/`.

### 2. Do not re-enable Git LFS

The Vercel CLI resolves LFS-tracked paths through git and uploads the **pointer file** instead of the
real content, so images deploy as ~130-byte text files and render as broken-image icons while every
local copy looks correct. The tracked payload is only ~6.9 MB, so the binaries are committed
directly. There is deliberately no `.gitattributes` with `filter=lfs` rules.

If LFS is ever reintroduced, verify a deployed binary by **byte size**, not HTTP status — the SPA
rewrite makes a missing file return `index.html` with a 200.

### 3. npm, not pnpm

`package-lock.json` is authoritative. A stale `pnpm-lock.yaml` used to sit in the repo; Vercel
detects the package manager from the lockfile and failed with `ERR_PNPM_OUTDATED_LOCKFILE`. Do not
add a pnpm lockfile back.

### 4. `oxfmt` is pinned to an exact version

`oxfmt@0.2.0` silently dropped semicolons from type literals and produced 36 TS1005 errors across 19
files. The version in `package.json` is exact on purpose.

---

## Testing

There is no automated test suite yet — `npm test --if-present` no-ops, so the CI `test` job passes
vacuously. In practice the safety net is:

- `npx tsc --noEmit` and `npm run format -- --check` on every push.
- A headless-browser smoke test of the built output. Type checks will not catch a broken bundle; the
  duplicate-React bug above passed every check and still produced a blank page.
- `scripts/local-pg-validate.sh` for migrations, run twice to prove idempotency.
- `scripts/probe-live-security.ps1` and `scripts/probe-live-console-errors.ps1` against the live
  project, using only the anon key.

`supabase/tests/rls_role_tests.sql` exercises the role policies.

---

## Related documents

| File                                 | Contents                                                 |
| ------------------------------------ | -------------------------------------------------------- |
| `PRODUCTION_DEPLOYMENT_CHECKLIST.md` | Pre-launch checklist                                     |
| `supabase/README.md`                 | Schema notes and deployment history                      |
| `src/lib/services/README.md`         | Service layer conventions                                |
| `docs/diagrams/`                     | System flow, use case, ERD, flowchart, DFD, architecture |

---

## Contact

Public enquiries: **westwoodlawfirm1@gmail.com** — defined once in `src/lib/firm.ts`, so change it
there rather than inline.
