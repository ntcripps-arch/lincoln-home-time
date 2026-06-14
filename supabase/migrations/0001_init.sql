-- =============================================================================
-- Co-Parenting Calendar — initial schema (fresh-deploy edition)
-- All enum values are defined up front so a new database applies cleanly with
-- no `ALTER TYPE ... ADD VALUE` ordering issues.
--
-- Table-name notes: the product brief's `users` -> `profiles` (Supabase
-- convention, mirrors auth.users); `family_profiles` -> `families`;
-- `household_profiles` -> `households`. `family_members` (a join table for
-- per-family role + household) is added for clean role-based RLS.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type family_role         as enum ('admin', 'viewer');
create type plan_status         as enum ('draft', 'active', 'archived');
create type rule_type           as enum (
  'alternating_weeks', 'cycle_2255', 'cycle_223', 'weekday_weekend',
  'custom_cycle',                       -- arbitrary repeating N-day pattern
  'holiday', 'summer_override', 'school_break_override', 'custom'
);
create type school_upload_status as enum ('pending_review', 'active', 'archived');
create type school_date_status   as enum ('proposed', 'approved', 'rejected');
create type school_category      as enum (
  'holiday', 'no_school', 'early_release', 'break',
  'teacher_work_day', 'first_day', 'last_day', 'event'
);
create type manual_category      as enum (
  'appointment', 'sports', 'performance', 'travel', 'reminder', 'other'
);
create type exception_type       as enum (
  'swap', 'vacation', 'holiday_override', 'pickup_dropoff_change', 'note'
);
create type invitation_status    as enum ('pending', 'accepted', 'revoked', 'expired');
create type audit_action         as enum (
  'plan_uploaded', 'plan_locked', 'plan_unlocked', 'plan_version_changed',
  'school_calendar_uploaded', 'school_dates_approved',
  'exception_added', 'exception_edited', 'exception_deleted',
  'manual_event_added', 'invitation_sent', 'member_joined',
  -- collaboration layer:
  'request_submitted', 'request_approved', 'request_denied',
  'request_countered', 'request_withdrawn', 'trip_added', 'avatar_updated'
);

-- -----------------------------------------------------------------------------
-- Identity / tenancy
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create table public.families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families (id) on delete cascade,
  name            text not null,
  color           text not null default '#3b82f6',
  pickup_default  text,
  dropoff_default text,
  sort_order      int  not null default 0,
  created_at      timestamptz not null default now()
);
create index on public.households (family_id);

create table public.family_members (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  role         family_role not null default 'viewer',
  household_id uuid references public.households (id),   -- which home this member belongs to
  created_at   timestamptz not null default now(),
  unique (family_id, profile_id)
);
create index on public.family_members (profile_id);

-- -----------------------------------------------------------------------------
-- Parenting plan: versioned + lockable baseline
-- -----------------------------------------------------------------------------
create table public.parenting_plan_versions (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families (id) on delete cascade,
  version          int  not null,
  status           plan_status not null default 'draft',
  locked           boolean not null default false,
  source_file_path text,
  source_text      text,
  notes            text,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  locked_by        uuid references public.profiles (id),
  locked_at        timestamptz,
  unique (family_id, version)
);
create unique index parenting_plan_one_active
  on public.parenting_plan_versions (family_id) where status = 'active';

create table public.parenting_schedule_rules (
  id              uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references public.parenting_plan_versions (id) on delete cascade,
  family_id       uuid not null references public.families (id) on delete cascade,
  rule_type       rule_type not null,
  household_id    uuid references public.households (id),
  config          jsonb not null default '{}'::jsonb,   -- structured rule (see src/lib/types.ts)
  priority        int  not null default 0,              -- higher overrides lower
  effective_start date,
  effective_end   date,
  label           text,
  created_at      timestamptz not null default now()
);
create index on public.parenting_schedule_rules (plan_version_id);
create index on public.parenting_schedule_rules (family_id);

create table public.generated_parenting_events (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families (id) on delete cascade,
  plan_version_id uuid not null references public.parenting_plan_versions (id) on delete cascade,
  date            date not null,
  household_id    uuid references public.households (id),
  source_rule_id  uuid references public.parenting_schedule_rules (id) on delete set null,
  pickup_time     text,
  dropoff_time    text,
  generated_at    timestamptz not null default now(),
  unique (family_id, plan_version_id, date)
);
create index on public.generated_parenting_events (family_id, date);

-- -----------------------------------------------------------------------------
-- School calendar layer
-- -----------------------------------------------------------------------------
create table public.school_calendar_uploads (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  school_year text not null,
  file_path   text,
  source_text text,
  status      school_upload_status not null default 'pending_review',
  uploaded_by uuid references public.profiles (id),
  uploaded_at timestamptz not null default now(),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz
);
create index on public.school_calendar_uploads (family_id);

create table public.school_calendar_dates (
  id         uuid primary key default gen_random_uuid(),
  upload_id  uuid not null references public.school_calendar_uploads (id) on delete cascade,
  family_id  uuid not null references public.families (id) on delete cascade,
  date       date not null,
  end_date   date,
  category   school_category not null,
  title      text not null,
  notes      text,
  status     school_date_status not null default 'proposed',
  created_at timestamptz not null default now()
);
create index on public.school_calendar_dates (family_id, date);
create index on public.school_calendar_dates (upload_id);

-- -----------------------------------------------------------------------------
-- Manual events & exceptions (overlays — never touch the locked plan)
-- -----------------------------------------------------------------------------
create table public.manual_events (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families (id) on delete cascade,
  title      text not null,
  date       date not null,
  start_time text,
  end_time   text,
  all_day    boolean not null default false,
  location   text,
  notes      text,
  category   manual_category not null default 'other',
  visibility text not null default 'everyone',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.manual_events (family_id, date);

create table public.exceptions (
  id                    uuid primary key default gen_random_uuid(),
  family_id             uuid not null references public.families (id) on delete cascade,
  exception_type        exception_type not null,
  start_date            date not null,
  end_date              date not null,
  household_id          uuid references public.households (id),
  original_household_id uuid references public.households (id),
  pickup_time           text,
  dropoff_time          text,
  note                  text,
  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on public.exceptions (family_id, start_date);

-- -----------------------------------------------------------------------------
-- Invitations & audit
-- -----------------------------------------------------------------------------
create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families (id) on delete cascade,
  email        text not null,
  role         family_role not null default 'viewer',
  household_id uuid references public.households (id),
  token        uuid not null default gen_random_uuid(),
  status       invitation_status not null default 'pending',
  invited_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  accepted_by  uuid references public.profiles (id),
  accepted_at  timestamptz,
  expires_at   timestamptz not null default (now() + interval '14 days'),
  unique (token)
);
create index on public.invitations (family_id);
create index on public.invitations (email);

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  actor_id    uuid references public.profiles (id),
  action      audit_action not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index on public.audit_log (family_id, created_at desc);

-- =============================================================================
-- Trigger functions
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger families_set_updated_at  before update on public.families
  for each row execute function public.set_updated_at();
create trigger exceptions_set_updated_at before update on public.exceptions
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- a locked plan version's rules cannot be inserted/updated/deleted
create or replace function public.guard_locked_plan_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_locked boolean; v_version_id uuid;
begin
  v_version_id := coalesce(new.plan_version_id, old.plan_version_id);
  select locked into v_locked from public.parenting_plan_versions where id = v_version_id;
  if v_locked then
    raise exception 'Plan version % is locked. Unlock it (creates a new draft) before editing rules.', v_version_id
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end; $$;

create trigger guard_locked_rules
  before insert or update or delete on public.parenting_schedule_rules
  for each row execute function public.guard_locked_plan_rules();

-- a locked version is immutable except the explicit unlock transition
create or replace function public.guard_locked_plan_version()
returns trigger language plpgsql as $$
begin
  if old.locked and new.locked = true then
    raise exception 'Plan version % is locked. Use the explicit Unlock action.', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;

create trigger guard_locked_version
  before update on public.parenting_plan_versions
  for each row execute function public.guard_locked_plan_version();

-- =============================================================================
-- RLS helpers (SECURITY DEFINER + empty search_path; owned by migration role so
-- they bypass RLS and avoid recursion on family_members)
-- =============================================================================
create or replace function public.is_family_member(p_family_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (select 1 from public.family_members
                 where family_id = p_family_id and profile_id = auth.uid());
$$;

create or replace function public.is_family_admin(p_family_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (select 1 from public.family_members
                 where family_id = p_family_id and profile_id = auth.uid() and role = 'admin');
$$;

-- profiles of people who share a family with the current user
create or replace function public.shares_family(p_other uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.family_members a
    join public.family_members b on a.family_id = b.family_id
    where a.profile_id = auth.uid() and b.profile_id = p_other);
$$;

create or replace function public.write_audit(
  p_family_id uuid, p_action audit_action, p_entity_type text default null,
  p_entity_id uuid default null, p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_family_member(p_family_id) then
    raise exception 'not a member of family %', p_family_id;
  end if;
  insert into public.audit_log (family_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_family_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
end; $$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles                 enable row level security;
alter table public.families                  enable row level security;
alter table public.households                 enable row level security;
alter table public.family_members             enable row level security;
alter table public.parenting_plan_versions    enable row level security;
alter table public.parenting_schedule_rules   enable row level security;
alter table public.generated_parenting_events enable row level security;
alter table public.school_calendar_uploads    enable row level security;
alter table public.school_calendar_dates      enable row level security;
alter table public.manual_events              enable row level security;
alter table public.exceptions                 enable row level security;
alter table public.invitations                enable row level security;
alter table public.audit_log                  enable row level security;

-- profiles: self + co-family members
create policy profiles_select_covisible on public.profiles
  for select using (id = auth.uid() or public.shares_family(id));
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid());

-- families
create policy families_select on public.families for select using (public.is_family_member(id));
create policy families_insert on public.families for insert with check (created_by = auth.uid());
create policy families_update on public.families for update using (public.is_family_admin(id));

-- family_members
create policy members_select on public.family_members
  for select using (profile_id = auth.uid() or public.is_family_member(family_id));
create policy members_admin_write on public.family_members
  for all using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));
create policy members_self_insert on public.family_members
  for insert with check (profile_id = auth.uid());

-- households
create policy households_select on public.households for select using (public.is_family_member(family_id));
create policy households_write on public.households
  for all using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));

-- parenting plan
create policy plan_versions_select on public.parenting_plan_versions for select using (public.is_family_member(family_id));
create policy plan_versions_write on public.parenting_plan_versions
  for all using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));
create policy rules_select on public.parenting_schedule_rules for select using (public.is_family_member(family_id));
create policy rules_write on public.parenting_schedule_rules
  for all using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));
create policy generated_select on public.generated_parenting_events for select using (public.is_family_member(family_id));
create policy generated_write on public.generated_parenting_events
  for all using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));

-- school
create policy school_uploads_select on public.school_calendar_uploads for select using (public.is_family_member(family_id));
create policy school_uploads_write on public.school_calendar_uploads
  for all using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));
create policy school_dates_select on public.school_calendar_dates for select using (public.is_family_member(family_id));
create policy school_dates_write on public.school_calendar_dates
  for all using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));

-- manual events
create policy manual_select on public.manual_events
  for select using (public.is_family_member(family_id) and (visibility = 'everyone' or public.is_family_admin(family_id)));
create policy manual_insert on public.manual_events
  for insert with check (public.is_family_member(family_id) and created_by = auth.uid());
create policy manual_update on public.manual_events
  for update using (created_by = auth.uid() or public.is_family_admin(family_id));
create policy manual_delete on public.manual_events
  for delete using (created_by = auth.uid() or public.is_family_admin(family_id));

-- exceptions
create policy exceptions_select on public.exceptions for select using (public.is_family_member(family_id));
create policy exceptions_write on public.exceptions
  for all using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));

-- invitations / audit
create policy invitations_admin on public.invitations
  for all using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));
create policy audit_select on public.audit_log for select using (public.is_family_member(family_id));
