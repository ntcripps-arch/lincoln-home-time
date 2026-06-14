-- =============================================================================
-- 0005 — Recurring manual events.
--   A series holds the recurrence rule; occurrences are normal manual_events
--   rows linked by series_id (so the calendar renders them unchanged). Editing
--   one occurrence sets overridden=true so a later series regenerate preserves
--   it. Deleting the series cascades to its occurrences.
-- =============================================================================

create table public.manual_event_series (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  title       text not null,
  category    manual_category not null default 'other',
  location    text,
  notes       text,
  all_day     boolean not null default false,
  start_time  text,
  end_time    text,
  weekdays    int[] not null default '{}',     -- 0=Sun .. 6=Sat
  start_date  date not null,
  end_date    date not null,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.manual_event_series (family_id);

create trigger manual_event_series_set_updated_at before update on public.manual_event_series
  for each row execute function public.set_updated_at();

alter table public.manual_events
  add column if not exists series_id  uuid references public.manual_event_series (id) on delete cascade,
  add column if not exists overridden boolean not null default false;
create index on public.manual_events (series_id);

alter table public.manual_event_series enable row level security;

create policy series_select on public.manual_event_series
  for select using (public.is_family_member(family_id));
create policy series_insert on public.manual_event_series
  for insert with check (public.is_family_member(family_id) and created_by = auth.uid());
create policy series_update on public.manual_event_series
  for update using (created_by = auth.uid() or public.is_family_admin(family_id));
create policy series_delete on public.manual_event_series
  for delete using (created_by = auth.uid() or public.is_family_admin(family_id));
