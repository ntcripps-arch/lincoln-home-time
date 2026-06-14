# Family Calendar — Private Shared Parenting Calendar

A private, calendar-first web app for a co-parenting schedule. It combines a
**locked parenting plan**, **school-calendar dates**, and **manual events /
exceptions** into one clean view that makes it immediately clear which household
has the child on each day.

> Scope: this is intentionally **not** a full co-parenting app. No messaging,
> payments, expense sharing, legal-document workflows, or dispute resolution.
> It is a shared calendar with a lightweight time-request approval flow.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind + shadcn/ui ·
Supabase (auth, Postgres + RLS, storage, edge functions) · Resend · Vercel.

---

## What's built (backend complete, verified)

- **Schema + RLS** (`supabase/migrations/0001_init.sql`, `0002_collaboration.sql`):
  families, households, versioned/lockable parenting plan, structured schedule
  rules, school layer, manual events, exceptions, invitations, audit log, plus
  the collaboration layer (time requests with approvals, trips with flight +
  lodging, avatars). Lock guarantees and role-based access are enforced in the DB.
- **Rules engine** (`src/lib/rules-engine.ts`): pure, unit-tested. Generates the
  day-by-day household assignment from structured rules, then overlays exceptions.
- **The real schedule, verified** against months of the family's actual app data:
  a 14-day `custom_cycle` (Dad Thu→Mon every other week) + a `summer_override`
  (every-other-week Friday rotation). `npm test` enforces it; `npm run
  verify:schedule` prints the month-by-month proof.
- **Email** (`supabase/functions/notify`): Resend-backed notifications for invites,
  request submitted/decided, and trips.

**Not built yet:** the UI. See `CLAUDE.md` and `docs/BUILD_PLAN.md`.

---

## Local development

Prereqs: Node 18+, the [Supabase CLI](https://supabase.com/docs/guides/cli), Docker.

```bash
npm install
supabase start              # local Postgres, Auth, Storage, Studio
supabase db reset           # apply migrations 0001/0002 + seed demo data
cp .env.example .env        # fill in values printed by `supabase start`
npm run dev                 # http://localhost:3000
```

Demo login (from the seed): `demo@familycalendar.test` / `demo-password-123`

```bash
npm test                    # rules-engine tests incl. the verified real schedule
npm run verify:schedule     # human-readable month-by-month proof vs the app
```

---

## Deploying to Vercel

1. **Supabase project:** create one, then push the schema. Either link the CLI
   (`supabase link` → `supabase db push`) or paste `0001_init.sql` then
   `0002_collaboration.sql` into the SQL editor. Skip `seed.sql` in production.
2. **Email function:**
   ```bash
   supabase functions deploy notify
   supabase secrets set RESEND_API_KEY=... "RESEND_FROM=Family Calendar <calendar@yourdomain.com>" SITE_URL=https://your-app.vercel.app
   ```
   (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected into functions automatically.)
3. **GitHub → Vercel:** push this repo, import it in Vercel.
4. **Vercel env vars** (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (encrypted)
   - `NEXT_PUBLIC_SITE_URL` (your production URL)
5. **Supabase Auth settings:** add your Vercel URL to allowed redirect URLs and
   set the Site URL.
6. Deploy.

After the schema is live you can replace the hand-written types:
`npm run db:types`.

---

## Applying the real schedule to production

The demo seed already encodes the verified schedule with anonymized household
names. In production, create your real households, then insert the same two
rules with your real household IDs — the configs are in `seed.sql` (the
`custom_cycle` base rule and the `summer_override`). Lock the plan version after
inserting the rules.

## Project structure

```
src/lib/          rules-engine.ts (+ tests), types.ts, supabase/, utils.ts
src/app/          App Router shell (UI pages to be built — see BUILD_PLAN.md)
src/middleware.ts auth gate
supabase/         migrations/, seed.sql, config.toml, functions/notify/
docs/             BUILD_PLAN.md, verification/ (schedule proofs)
CLAUDE.md         brief for building the UI with Claude Code
```
