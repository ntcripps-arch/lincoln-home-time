# CLAUDE.md — working brief for this repo

You are helping build the **UI** for a private co-parenting calendar. The backend
(schema, RLS, rules engine, email) is **done and verified** — do not rewrite it.
Build the Next.js App Router UI on top of it.

## Golden rules

1. **Scope is calendar-first.** No messaging, payments, expense sharing, legal
   docs, or dispute resolution. A time request's approve/deny/propose-alternative
   is the only "workflow" — keep it that way.
2. **Never bypass the rules engine for schedule logic.** All "who has the child"
   answers come from `src/lib/rules-engine.ts` (`generateBaseline` then
   `applyExceptions`). Don't re-derive rotations in components.
3. **Never mutate the locked plan to represent a one-off.** One-offs are
   `exceptions` (overlays). The DB enforces this; respect it in the UI.
4. **Respect RLS.** Read/write as the authenticated user via the SSR Supabase
   clients (`src/lib/supabase/server.ts` for RSC/actions, `client.ts` for client
   components). Admins manage; viewers read. Don't use the service role in the app.
5. **Run `npm test` before and after schedule-related changes.** The real
   schedule is pinned in `rules-engine.test.ts`; keep it green.
6. Read `/mnt/skills/public/frontend-design/SKILL.md` before building UI, and use
   shadcn/ui (config in `components.json`). The theme (calm, non-"court app") is in
   `src/app/globals.css`.

## How the data model works (read before coding)

- **Households** carry a `color` — use it for the calendar's per-household tint
  (the existing app uses one color per home; match that).
- **Parenting plan** is versioned + lockable. Rules live in
  `parenting_schedule_rules.config` as typed JSON (see `src/lib/types.ts`). The
  baseline is a rotation rule; holiday/summer/school-break/custom are overrides
  layered by `priority`.
- **Exceptions** overlay the baseline and render visually distinct
  (`source: 'exception'`).
- **Time requests** → `decide_time_request(p_request_id, p_decision, p_note,
  p_proposed_start, p_proposed_end)` RPC handles approve/deny/counter atomically
  and materializes an exception on approve. Call it; don't hand-roll the transition.
- **Trips** have `trip_segments` (flight/lodging) — show where the child is staying.

## Rendering the calendar (the core)

```ts
import { generateBaseline, applyExceptions } from '@/lib/rules-engine';
// 1. load households, the active plan version's rules, and exceptions (RLS-scoped)
// 2. const base = generateBaseline({ rules, households, rangeStart, rangeEnd });
// 3. const days = applyExceptions(base, exceptions);
// 4. paint each day with households.find(h => h.id === day.householdId)?.color,
//    and badge days where day.source === 'exception'. Overlay school dates,
//    manual events, and trips as separate filterable layers.
```

## After any mutation, fire the email

```ts
await supabase.functions.invoke('notify', { body: { type, /* requestId|tripId|invitationId */ } });
// types: 'invitation' | 'request_submitted' | 'request_decided' | 'trip_added'
```

## Build order (see docs/BUILD_PLAN.md for page specs)

1. Auth: `/login` + `/auth/callback`, the invite-accept page `/invite`.
2. `/calendar` month view (the centerpiece) + agenda; layer filters.
3. `/parenting-plan` (view, version history, lock/unlock with warning).
4. `/exceptions` = time-request inbox + submit form + approve/deny/counter.
5. `/uploads` + `/school-calendars` (upload → review table → approve).
6. `/settings` (avatar upload to the `avatars` bucket) + `/invite` (admin sends).
7. Trips UI (entry with flight/lodging segments; surfaced on the calendar).

Keep PRs small and verifiable; prefer Server Components + Server Actions.
```
