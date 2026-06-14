-- =============================================================================
-- Collaboration layer: extra-time requests with approvals, trips with flight +
-- lodging visibility, and the avatars storage bucket.
-- (profiles.avatar_url, the household_id columns, the audit_action values, and
--  the profiles "co-family visible" policy all live in 0001.)
--
-- Scope guardrail: calendar coordination only — no messaging, payments,
-- expenses, or dispute resolution. "Propose alternative" is a single bounded
-- counter (dates + one note), not a thread.
-- =============================================================================

create type request_type   as enum ('vacation', 'family_event', 'swap', 'holiday', 'travel', 'other');
create type request_status as enum ('pending', 'approved', 'denied', 'countered', 'withdrawn', 'expired');
create type segment_type   as enum ('flight', 'lodging', 'ground', 'other');

-- Extra-time requests + approval workflow ------------------------------------
create table public.time_requests (
  id                     uuid primary key default gen_random_uuid(),
  family_id              uuid not null references public.families (id) on delete cascade,
  requester_id           uuid not null references public.profiles (id),
  request_type           request_type not null default 'other',
  requested_household_id uuid references public.households (id),
  start_date             date not null,
  end_date               date not null,
  start_time             text,
  end_time               text,
  title                  text not null,
  note                   text,
  status                 request_status not null default 'pending',
  decided_by             uuid references public.profiles (id),
  decided_at             timestamptz,
  decision_note          text,
  proposed_start_date    date,
  proposed_end_date      date,
  linked_exception_id    uuid references public.exceptions (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index on public.time_requests (family_id, status);
create index on public.time_requests (requester_id);
create trigger time_requests_set_updated_at before update on public.time_requests
  for each row execute function public.set_updated_at();

-- Trips (travel visibility) + flight/lodging segments ------------------------
create table public.trips (
  id                     uuid primary key default gen_random_uuid(),
  family_id              uuid not null references public.families (id) on delete cascade,
  title                  text not null,
  traveling_household_id uuid references public.households (id),
  start_date             date not null,
  end_date               date not null,
  destination            text,
  notes                  text,
  linked_request_id      uuid references public.time_requests (id) on delete set null,
  created_by             uuid references public.profiles (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index on public.trips (family_id, start_date);
create trigger trips_set_updated_at before update on public.trips
  for each row execute function public.set_updated_at();

create table public.trip_segments (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  family_id    uuid not null references public.families (id) on delete cascade,
  segment_type segment_type not null,
  title        text,
  start_at     timestamptz,
  end_at       timestamptz,
  location     text,
  confirmation text,
  details      jsonb not null default '{}'::jsonb,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index on public.trip_segments (trip_id);

-- RLS ------------------------------------------------------------------------
alter table public.time_requests enable row level security;
alter table public.trips         enable row level security;
alter table public.trip_segments enable row level security;

create policy requests_select on public.time_requests for select using (public.is_family_member(family_id));
create policy requests_insert on public.time_requests
  for insert with check (public.is_family_member(family_id) and requester_id = auth.uid());
create policy requests_update on public.time_requests
  for update using (public.is_family_admin(family_id) or requester_id = auth.uid());
create policy requests_delete on public.time_requests
  for delete using (public.is_family_admin(family_id) or requester_id = auth.uid());

create policy trips_select on public.trips for select using (public.is_family_member(family_id));
create policy trips_insert on public.trips
  for insert with check (public.is_family_member(family_id) and created_by = auth.uid());
create policy trips_update on public.trips
  for update using (created_by = auth.uid() or public.is_family_admin(family_id));
create policy trips_delete on public.trips
  for delete using (created_by = auth.uid() or public.is_family_admin(family_id));

create policy segments_select on public.trip_segments for select using (public.is_family_member(family_id));
create policy segments_write on public.trip_segments
  for all using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

-- Approval action: atomic transition + materialize overlay + audit -----------
-- decision: 'approve' | 'deny' | 'counter'
create or replace function public.decide_time_request(
  p_request_id uuid, p_decision text, p_note text default null,
  p_proposed_start date default null, p_proposed_end date default null)
returns public.time_requests
language plpgsql security definer set search_path = '' as $$
declare r public.time_requests; ex_id uuid; act public.audit_action;
begin
  select * into r from public.time_requests where id = p_request_id for update;
  if not found then raise exception 'request % not found', p_request_id; end if;
  if not public.is_family_admin(r.family_id) then
    raise exception 'only a family admin can decide requests'; end if;
  if r.status not in ('pending','countered') then
    raise exception 'request is % and cannot be decided', r.status; end if;

  if p_decision = 'approve' then
    insert into public.exceptions
      (family_id, exception_type, start_date, end_date, household_id, note, created_by)
    values (r.family_id,
      case r.request_type when 'vacation' then 'vacation' when 'travel' then 'vacation'
                          when 'holiday' then 'holiday_override' else 'swap' end,
      coalesce(p_proposed_start, r.start_date), coalesce(p_proposed_end, r.end_date),
      r.requested_household_id,
      coalesce(r.title,'') || case when r.note is not null then ' — ' || r.note else '' end,
      r.requester_id)
    returning id into ex_id;
    update public.time_requests
       set status='approved', decided_by=auth.uid(), decided_at=now(), decision_note=p_note,
           linked_exception_id=ex_id, proposed_start_date=p_proposed_start, proposed_end_date=p_proposed_end
     where id=r.id returning * into r;
    act := 'request_approved';
  elsif p_decision = 'deny' then
    update public.time_requests set status='denied', decided_by=auth.uid(), decided_at=now(), decision_note=p_note
      where id=r.id returning * into r;
    act := 'request_denied';
  elsif p_decision = 'counter' then
    if p_proposed_start is null or p_proposed_end is null then
      raise exception 'counter requires proposed dates'; end if;
    update public.time_requests
       set status='countered', decided_by=auth.uid(), decided_at=now(), decision_note=p_note,
           proposed_start_date=p_proposed_start, proposed_end_date=p_proposed_end
     where id=r.id returning * into r;
    act := 'request_countered';
  else raise exception 'unknown decision %', p_decision; end if;

  insert into public.audit_log (family_id, actor_id, action, entity_type, entity_id, metadata)
  values (r.family_id, auth.uid(), act, 'time_requests', r.id, jsonb_build_object('decision', p_decision));
  return r;
end; $$;

-- Avatars storage bucket (private; app is invite-only so authed reads are safe)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false) on conflict (id) do nothing;

create policy avatars_read on storage.objects
  for select to authenticated using (bucket_id = 'avatars');
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
