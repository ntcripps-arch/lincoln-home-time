-- =============================================================================
-- 0007 — School-calendar PDF storage.
--   Private bucket for uploaded school-calendar PDFs. Path convention is
--   '<family_id>/<upload_id>.pdf'. Any family member may read; only admins may
--   write (mirrors the parenting-plan admin-write model). The extractor sends
--   the PDF to Claude's vision API to read the month grids + legend.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-calendars', 'school-calendars', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;

-- Read: any member of the family that owns the first path segment.
create policy school_cal_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'school-calendars'
    and exists (
      select 1 from public.family_members fm
      where fm.profile_id = auth.uid()
        and fm.family_id::text = (storage.foldername(name))[1]
    )
  );

-- Write (insert/update/delete): admins of that family only.
create policy school_cal_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'school-calendars'
    and exists (
      select 1 from public.family_members fm
      where fm.profile_id = auth.uid()
        and fm.role = 'admin'
        and fm.family_id::text = (storage.foldername(name))[1]
    )
  );

create policy school_cal_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'school-calendars'
    and exists (
      select 1 from public.family_members fm
      where fm.profile_id = auth.uid()
        and fm.role = 'admin'
        and fm.family_id::text = (storage.foldername(name))[1]
    )
  );

create policy school_cal_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'school-calendars'
    and exists (
      select 1 from public.family_members fm
      where fm.profile_id = auth.uid()
        and fm.role = 'admin'
        and fm.family_id::text = (storage.foldername(name))[1]
    )
  );
