-- =============================================================================
-- Demo seed (loaded by `supabase db reset`). LOCAL DEV ONLY.
--   login: demo@familycalendar.test  /  demo-password-123
--
-- Uses the SAME verified schedule as production (just anonymized household
-- names) so the demo calendar renders identically: a 14-day custom_cycle base
-- (Dad Thu→Mon e/o week) + the summer 2026 Friday-rotation override, plus
-- school dates, a pending time request, and a trip with flight + lodging.
-- =============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new)
values (
  '00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'demo@familycalendar.test',
  crypt('demo-password-123', gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Demo Parent"}', '', '', '', '')
on conflict (id) do nothing;

insert into public.profiles (id, email, display_name)
values ('11111111-1111-1111-1111-111111111111', 'demo@familycalendar.test', 'Demo Parent')
on conflict (id) do nothing;

insert into public.families (id, name, created_by)
values ('22222222-2222-2222-2222-222222222222', 'The Demo Family', '11111111-1111-1111-1111-111111111111');

insert into public.households (id, family_id, name, color, pickup_default, sort_order) values
  ('33333333-3333-3333-3333-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Mom''s house', '#e879a6', '15:30', 0),
  ('33333333-3333-3333-3333-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Dad''s house', '#3b82f6', '08:00', 1);

insert into public.family_members (family_id, profile_id, role, household_id)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'admin',
        '33333333-3333-3333-3333-aaaaaaaaaaaa');

-- Plan version: insert UNLOCKED, add rules, then lock (guard trigger blocks
-- rule writes once locked).
insert into public.parenting_plan_versions (id, family_id, version, status, locked, source_text, notes, created_by)
values ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 1, 'active', false,
        'Steady-state residential schedule + summer override.', 'Demo baseline',
        '11111111-1111-1111-1111-111111111111');

-- Base school-year rotation: Dad (A) Thu→Mon every other week, anchor 2026-01-01.
insert into public.parenting_schedule_rules
  (plan_version_id, family_id, rule_type, priority, label, config)
values ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222',
  'custom_cycle', 0, 'Week on / week off (Dad Thu→Tue)',
  jsonb_build_object('kind','custom_cycle','anchorDate','2026-01-01','cycleLength',14,
    'parentA','33333333-3333-3333-3333-bbbbbbbbbbbb','parentB','33333333-3333-3333-3333-aaaaaaaaaaaa',
    'pattern', jsonb_build_array('A','A','A','A','A','B','B','B','B','B','B','B','B','B')));

-- Summer 2026 override: e/o week, Friday exchange, Dad first (even year).
insert into public.parenting_schedule_rules
  (plan_version_id, family_id, rule_type, priority, label, effective_start, effective_end, config)
values ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222',
  'summer_override', 50, 'Summer 2026 (e/o week, Fri exchange)', date '2026-06-13', date '2026-08-31',
  jsonb_build_object('kind','summer_override','start','2026-06-13','end','2026-08-31',
    'rotation', jsonb_build_object('kind','custom_cycle','anchorDate','2026-07-03','cycleLength',14,
      'parentA','33333333-3333-3333-3333-bbbbbbbbbbbb','parentB','33333333-3333-3333-3333-aaaaaaaaaaaa',
      'pattern', jsonb_build_array('A','A','A','A','A','A','A','B','B','B','B','B','B','B'))));

update public.parenting_plan_versions
   set locked=true, locked_by='11111111-1111-1111-1111-111111111111', locked_at=now()
 where id='44444444-4444-4444-4444-444444444444';

-- School calendar (real University Place 2025-26 public dates, approved) -------
insert into public.school_calendar_uploads (id, family_id, school_year, status, uploaded_by, approved_by, approved_at)
values ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', '2025-2026', 'active',
        '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now());

insert into public.school_calendar_dates (upload_id, family_id, date, end_date, category, title, status) values
  ('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222','2025-11-11',null,'holiday','Veterans Day','approved'),
  ('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222','2025-11-26','2025-11-28','break','Thanksgiving Vacation','approved'),
  ('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222','2025-12-22','2026-01-02','break','Winter Vacation','approved'),
  ('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222','2026-01-19',null,'no_school','MLK Jr. Day','approved'),
  ('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222','2026-02-13','2026-02-16','break','Presidents'' Day Weekend','approved'),
  ('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222','2026-04-06','2026-04-10','break','Spring Break','approved'),
  ('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222','2026-06-12',null,'last_day','Last Day of School','approved');

-- A pending extra-time request (shows the approval inbox) ----------------------
insert into public.time_requests (family_id, requester_id, request_type, requested_household_id,
  start_date, end_date, title, note, status)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'vacation',
  '33333333-3333-3333-3333-aaaaaaaaaaaa', '2026-07-13', '2026-07-16',
  'Grandparents visit', 'Three nights at the lake during my off-week', 'pending');

-- A trip with flight + lodging visibility -------------------------------------
with t as (
  insert into public.trips (id, family_id, title, traveling_household_id, start_date, end_date, destination, created_by)
  values ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222',
    'Disneyland with Dad', '33333333-3333-3333-3333-bbbbbbbbbbbb', '2026-07-17', '2026-07-20',
    'Anaheim, CA', '11111111-1111-1111-1111-111111111111')
  returning id, family_id)
insert into public.trip_segments (trip_id, family_id, segment_type, title, start_at, end_at, location, confirmation, details)
select t.id, t.family_id, x.segment_type, x.title, x.start_at, x.end_at, x.location, x.confirmation, x.details
from t, (values
  ('flight'::segment_type, 'AS 1234 SEA→SNA', timestamptz '2026-07-17 08:10-07', timestamptz '2026-07-17 10:55-07',
    'SEA → SNA', 'ABC123', '{"airline":"Alaska","flight":"AS 1234","seat":"14C"}'::jsonb),
  ('lodging'::segment_type, 'Grand Californian', timestamptz '2026-07-17 16:00-07', timestamptz '2026-07-20 11:00-07',
    '1600 Disneyland Dr, Anaheim, CA', 'HTL-99887', '{"phone":"+1-714-635-2300","room":"Standard"}'::jsonb),
  ('flight'::segment_type, 'AS 1235 SNA→SEA', timestamptz '2026-07-20 18:30-07', timestamptz '2026-07-20 21:20-07',
    'SNA → SEA', 'ABC124', '{"airline":"Alaska","flight":"AS 1235","seat":"12A"}'::jsonb)
) as x(segment_type, title, start_at, end_at, location, confirmation, details);

insert into public.manual_events (family_id, title, date, start_time, end_time, location, category, created_by)
values ('22222222-2222-2222-2222-222222222222', 'Soccer practice', '2026-01-14', '17:00', '18:30',
        'Community Park Field 3', 'sports', '11111111-1111-1111-1111-111111111111');

insert into public.audit_log (family_id, actor_id, action, entity_type, entity_id, metadata)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        'plan_locked', 'parenting_plan_versions', '44444444-4444-4444-4444-444444444444', '{"version":1}');
