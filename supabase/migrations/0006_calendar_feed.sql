-- =============================================================================
-- 0006 — Tokenized ICS calendar feed.
--   Each member can mint a secret per-person token and subscribe to a read-only
--   .ics feed of the family schedule from their phone's native calendar. The
--   public feed route has no auth session, so it reads through a SECURITY DEFINER
--   function keyed by the bearer token (never the service role in app code).
-- =============================================================================

create table public.calendar_feeds (
  token       uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (family_id, profile_id)
);
create index on public.calendar_feeds (profile_id);

alter table public.calendar_feeds enable row level security;

-- A member sees and manages only their own feed row.
create policy calendar_feeds_select on public.calendar_feeds
  for select using (profile_id = auth.uid());
create policy calendar_feeds_insert on public.calendar_feeds
  for insert with check (profile_id = auth.uid() and public.is_family_member(family_id));
create policy calendar_feeds_update on public.calendar_feeds
  for update using (profile_id = auth.uid());
create policy calendar_feeds_delete on public.calendar_feeds
  for delete using (profile_id = auth.uid());

-- Resolve a feed token to the family's schedule inputs. SECURITY DEFINER so the
-- anonymous feed route can read exactly the token's family (and nothing else).
-- Returns null for an unknown token. The app runs the rules engine on these
-- inputs to build the ICS — this only ships raw rows.
create or replace function public.get_calendar_feed(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare
  v_family uuid;
  v_plan   uuid;
  v_result jsonb;
begin
  select family_id into v_family from public.calendar_feeds where token = p_token;
  if v_family is null then
    return null;
  end if;

  select id into v_plan from public.parenting_plan_versions
    where family_id = v_family and status = 'active'
    limit 1;

  select jsonb_build_object(
    'family_name', (select name from public.families where id = v_family),
    'households',  (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb)
                      from public.households h where h.family_id = v_family),
    'rules',       (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                      from public.parenting_schedule_rules r where r.plan_version_id = v_plan),
    'exceptions',  (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
                      from public.exceptions e where e.family_id = v_family),
    'school',      (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                      from public.school_calendar_dates s
                      where s.family_id = v_family and s.status = 'approved'),
    'events',      (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
                      from public.manual_events m where m.family_id = v_family),
    'trips',       (select coalesce(jsonb_agg(
                        to_jsonb(t) || jsonb_build_object(
                          'trip_segments',
                          (select coalesce(jsonb_agg(to_jsonb(seg) order by seg.sort_order), '[]'::jsonb)
                             from public.trip_segments seg where seg.trip_id = t.id)
                        )), '[]'::jsonb)
                      from public.trips t where t.family_id = v_family)
  ) into v_result;

  return v_result;
end;
$$;

-- The feed route calls this with the anon key and no user session.
grant execute on function public.get_calendar_feed(uuid) to anon, authenticated;
