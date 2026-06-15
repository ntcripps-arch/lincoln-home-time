-- =============================================================================
-- 0009 — Tighten trip-segment writes.
--   Previously `segments_write` allowed ANY family member to insert/update/delete
--   trip segments, while the parent `trips` row is creator-or-admin only. So a
--   viewer could rewrite or delete another member's itinerary. Tighten structural
--   edits to the trip's creator or a family admin (mirroring the trips policy).
--
--   Live flight-status refresh only updates the cached `details` and should stay
--   available to ANY family member viewing the trip — so it goes through a
--   SECURITY DEFINER RPC that enforces family membership instead of the policy.
-- =============================================================================

drop policy if exists segments_write on public.trip_segments;

create policy segments_write on public.trip_segments
  for all
  using (
    exists (
      select 1 from public.trips t
      where t.id = trip_segments.trip_id
        and (t.created_by = auth.uid() or public.is_family_admin(t.family_id))
    )
  )
  with check (
    exists (
      select 1 from public.trips t
      where t.id = trip_segments.trip_id
        and (t.created_by = auth.uid() or public.is_family_admin(t.family_id))
    )
  );

-- Refresh a flight segment's cached live status (details only). Any family
-- member may call it; structural edits remain gated by segments_write above.
create or replace function public.refresh_segment_status(p_id uuid, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
begin
  select family_id into v_family from public.trip_segments where id = p_id;
  if v_family is null then
    raise exception 'segment not found';
  end if;
  if not public.is_family_member(v_family) then
    raise exception 'not authorized';
  end if;
  update public.trip_segments set details = p_details where id = p_id;
end;
$$;

revoke all on function public.refresh_segment_status(uuid, jsonb) from public;
grant execute on function public.refresh_segment_status(uuid, jsonb) to authenticated;
