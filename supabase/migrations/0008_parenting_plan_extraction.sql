-- =============================================================================
-- 0008 — Parenting-plan extraction support.
--   1. Private 'plan-documents' bucket for uploaded plan images/PDFs
--      (family-keyed, admin-write — mirrors 'school-calendars').
--   2. activate_plan_version() RPC: atomically archive the current active
--      version and activate+lock the target draft. Needed because the partial
--      unique index `parenting_plan_one_active` forbids two active versions, and
--      because the guard_locked_plan_version trigger blocks updating a locked
--      row unless `locked` is cleared in the same statement.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plan-documents', 'plan-documents', false, 26214400,
        array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

create policy plan_docs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'plan-documents'
    and exists (
      select 1 from public.family_members fm
      where fm.profile_id = auth.uid()
        and fm.family_id::text = (storage.foldername(name))[1]
    )
  );

create policy plan_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'plan-documents'
    and exists (
      select 1 from public.family_members fm
      where fm.profile_id = auth.uid() and fm.role = 'admin'
        and fm.family_id::text = (storage.foldername(name))[1]
    )
  );

create policy plan_docs_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'plan-documents'
    and exists (
      select 1 from public.family_members fm
      where fm.profile_id = auth.uid() and fm.role = 'admin'
        and fm.family_id::text = (storage.foldername(name))[1]
    )
  );

create policy plan_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'plan-documents'
    and exists (
      select 1 from public.family_members fm
      where fm.profile_id = auth.uid() and fm.role = 'admin'
        and fm.family_id::text = (storage.foldername(name))[1]
    )
  );

-- Activate a draft plan version: archive the current active one, then lock+activate
-- the target. Admin-gated; writes an audit row.
create or replace function public.activate_plan_version(p_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid;
begin
  select family_id into v_family from public.parenting_plan_versions where id = p_version_id;
  if v_family is null then
    raise exception 'Plan version % not found', p_version_id;
  end if;
  if not public.is_family_admin(v_family) then
    raise exception 'Only a family admin can activate a parenting plan';
  end if;

  -- Archive the current active version. Clear `locked` in the SAME update so the
  -- guard_locked_plan_version trigger (which blocks locked→locked edits) allows it.
  update public.parenting_plan_versions
     set status = 'archived', locked = false
   where family_id = v_family and status = 'active' and id <> p_version_id;

  -- Activate + lock the target (it is a draft, locked=false, so the guard passes).
  update public.parenting_plan_versions
     set status = 'active', locked = true, locked_by = auth.uid(), locked_at = now()
   where id = p_version_id;

  perform public.write_audit(v_family, 'plan_locked', 'parenting_plan_versions', p_version_id, '{}'::jsonb);
end;
$$;

grant execute on function public.activate_plan_version(uuid) to authenticated;
