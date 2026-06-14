-- =============================================================================
-- 0003 — Cross-household decision gate for time requests.
--
-- Replaces the admin-only gate on decide_time_request with a cross-household
-- gate (the decider must be in the OTHER household than the requester), adds an
-- accept_counter RPC so the requester can accept the other household's counter,
-- and tightens the time_requests UPDATE policy so all cross-household logic
-- lives in the SECURITY DEFINER RPCs (only the requester's self-withdraw/decline
-- remains a direct update).
-- =============================================================================

-- (a) decide_time_request — body identical to 0002 except the gate ------------
create or replace function public.decide_time_request(
  p_request_id uuid, p_decision text, p_note text default null,
  p_proposed_start date default null, p_proposed_end date default null)
returns public.time_requests
language plpgsql security definer set search_path = '' as $$
declare r public.time_requests; ex_id uuid; act public.audit_action;
begin
  select * into r from public.time_requests where id = p_request_id for update;
  if not found then raise exception 'request % not found', p_request_id; end if;

  -- cross-household gate: only the OTHER household may decide a request
  if not exists (
    select 1
    from public.family_members me
    join public.family_members reqm on reqm.family_id = me.family_id
    where me.family_id    = r.family_id
      and me.profile_id   = auth.uid()
      and reqm.profile_id = r.requester_id
      and me.household_id is not null
      and reqm.household_id is not null
      and me.household_id <> reqm.household_id
  ) then
    raise exception 'only a member of the other household can decide this request';
  end if;

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

-- (b) accept_counter — the requester accepts the other household's counter -----
-- Requester-scoped; finalizes using the stored proposed dates (mirrors the
-- approve branch's exception materialization + audit).
create or replace function public.accept_counter(p_request_id uuid)
returns public.time_requests
language plpgsql security definer set search_path = '' as $$
declare r public.time_requests; ex_id uuid;
begin
  select * into r from public.time_requests where id = p_request_id for update;
  if not found then raise exception 'request % not found', p_request_id; end if;
  if r.requester_id <> auth.uid() then
    raise exception 'only the requester can accept this counter'; end if;
  if r.status <> 'countered' then
    raise exception 'request is % and has no counter to accept', r.status; end if;
  if r.proposed_start_date is null or r.proposed_end_date is null then
    raise exception 'this counter has no proposed dates'; end if;

  insert into public.exceptions
    (family_id, exception_type, start_date, end_date, household_id, note, created_by)
  values (r.family_id,
    case r.request_type when 'vacation' then 'vacation' when 'travel' then 'vacation'
                        when 'holiday' then 'holiday_override' else 'swap' end,
    r.proposed_start_date, r.proposed_end_date,
    r.requested_household_id,
    coalesce(r.title,'') || case when r.note is not null then ' — ' || r.note else '' end,
    r.requester_id)
  returning id into ex_id;

  update public.time_requests
     set status='approved', decided_by=auth.uid(), decided_at=now(), linked_exception_id=ex_id
   where id=r.id returning * into r;

  insert into public.audit_log (family_id, actor_id, action, entity_type, entity_id, metadata)
  values (r.family_id, auth.uid(), 'request_approved', 'time_requests', r.id,
          jsonb_build_object('decision', 'accept_counter'));
  return r;
end; $$;

-- (c) tighten direct UPDATE: only the requester's self-update remains; all
--     cross-household transitions go through the SECURITY DEFINER RPCs above.
drop policy if exists requests_update on public.time_requests;
create policy requests_update on public.time_requests
  for update using (requester_id = auth.uid());
