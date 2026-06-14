# UI Build Plan

Backend is done; this is the page/component spec for the UI phase. Order matches
`CLAUDE.md`. Each page lists data in, key actions, and notes. All reads/writes go
through RLS as the signed-in user.

## 1. Auth & invites
- **/login** — email magic-link or password (Supabase Auth). On success → `/calendar`.
- **/auth/callback** — exchange code, set session.
- **/invite?token=…** — public. Look up the invitation by token; if the user is
  signed in and the email matches, accept: insert a `family_members` row (family +
  role + household from the invitation), mark invitation accepted, write audit
  `member_joined`. If not signed in, prompt sign-up first.

## 2. Calendar (centerpiece)  — /calendar
- Data: households, active plan version's `parenting_schedule_rules`, `exceptions`,
  `school_calendar_dates` (approved), `manual_events`, `trips`.
- Compute days with `generateBaseline` + `applyExceptions`. Tint each day by the
  assigned household's `color`; badge `source==='exception'` days.
- **Layers** (toggle): parenting schedule, school calendar, family events,
  exceptions/swaps. **Views**: Month + Agenda (match the current app); Week optional.
- Day detail: which household, pickup/dropoff, school closures, events, trips.
- Mobile-first; the current app is phone-primary.

## 3. Parenting plan  — /parenting-plan
- Show the active version + a human-readable summary of its rules (base rotation,
  summer override, holidays). List version history; show locked/active state.
- **Lock/Unlock**: unlocking shows a clear warning and creates a new draft version
  (preserve old versions). Locked versions are immutable (DB-enforced). Write audit
  on lock/unlock/version change.

## 4. Time requests + approvals  — /exceptions
- **Inbox**: pending/countered requests with requester avatar + name, dates, type,
  note. Admin actions: **Approve**, **Deny**, **Propose alternative** (date picker
  + one note) → call `decide_time_request`. After: `notify` type `request_decided`.
- **Submit**: any member creates a request (type, dates, requested household, title,
  note). After insert → `notify` type `request_submitted`.
- Approved requests appear on the calendar as distinct exceptions (already wired via
  the RPC materializing an exception).

## 5. School calendar  — /uploads, /school-calendars
- Upload a calendar file (PDF/image/CSV/ICS/text) to storage; create a
  `school_calendar_uploads` row (`pending_review`).
- **Review table**: proposed `school_calendar_dates` with category dropdown
  (holiday / no_school / early_release / break / teacher_work_day / first_day /
  last_day / event); accept/edit/delete per row; approve → status `active`.
- Manual entry must always be possible (don't trust extraction silently).
- Archive/replace by school year.

## 6. Settings & invite  — /settings, /invite
- **/settings**: display name; **avatar upload** to the `avatars` bucket at path
  `avatars/{userId}/…`; set `profiles.avatar_url`.
- **/invite** (admin): send invitation by email + role + household (Clearman/
  Barrett) → insert `invitations` → `notify` type `invitation`.

## 7. Trips
- Create a trip (title, traveling household, dates, destination) + add
  `trip_segments` (flight: airline/flight#/airport/times; lodging: hotel/address/
  check-in-out/confirmation). After create → `notify` type `trip_added`.
- Surface on the calendar as a travel layer; trip detail shows the itinerary so
  both homes see where the child is staying.

## Components likely reused
- `MonthGrid`, `DayCell` (household color + badges), `LayerFilter`,
  `RequestCard` (+ approve/deny/counter actions), `Avatar`, `SegmentList`,
  `PlanSummary`, `ReviewTable`.

## Definition of done per page
Renders with seed data, respects RLS (test as a viewer too, not just SQL), fires
the right `notify` call on mutations, and keeps `npm test` green.
