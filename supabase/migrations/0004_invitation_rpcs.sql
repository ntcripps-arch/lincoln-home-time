-- =============================================================================
-- 0004 — Invitation accept flow.
--   preview_invitation(token) — safe, public-readable preview for the accept page.
--   accept_invitation(token)  — authed; email-matched; materializes membership.
--   Drops the over-permissive members_self_insert policy so memberships can only
--   be minted via accept_invitation (SECURITY DEFINER) or admin writes.
-- =============================================================================

-- Safe preview for the (possibly unauthenticated) accept page. Returns one row
-- for a valid token; for unknown/expired/non-pending tokens it returns either no
-- rows or valid=false with every other field null — never leaks invitation data.
create or replace function public.preview_invitation(p_token uuid)
returns table (valid boolean, family_name text, role text, household_name text, email text)
language sql security definer set search_path = '' stable as $$
  with inv as (
    select i.*, (i.status = 'pending' and i.expires_at > now()) as is_valid
    from public.invitations i
    where i.token = p_token
  )
  select
    coalesce(inv.is_valid, false)                          as valid,
    case when inv.is_valid then f.name end                 as family_name,
    case when inv.is_valid then inv.role::text end         as role,
    case when inv.is_valid then h.name end                 as household_name,
    case when inv.is_valid then inv.email end              as email
  from inv
  left join public.families f   on f.id = inv.family_id
  left join public.households h  on h.id = inv.household_id;
$$;

-- Accept: requires sign-in, requires the authed user's email to match the
-- invitation (blocks token interception), inserts the membership idempotently,
-- marks the invitation accepted, and writes the audit entry — atomically.
create or replace function public.accept_invitation(p_token uuid)
returns public.family_members
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitations;
  v_email text;
  v_member public.family_members;
begin
  if v_uid is null then
    raise exception 'You must be signed in to accept an invitation.';
  end if;

  select * into v_inv from public.invitations where token = p_token for update;
  if not found then raise exception 'This invitation could not be found.'; end if;
  if v_inv.status <> 'pending' then raise exception 'This invitation is no longer valid.'; end if;
  if v_inv.expires_at <= now() then raise exception 'This invitation has expired.'; end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email is null or lower(v_email) <> lower(v_inv.email) then
    raise exception 'This invitation was sent to a different email address.';
  end if;

  insert into public.family_members (family_id, profile_id, role, household_id)
  values (v_inv.family_id, v_uid, v_inv.role, v_inv.household_id)
  on conflict (family_id, profile_id)
    do update set role = excluded.role, household_id = excluded.household_id
  returning * into v_member;

  update public.invitations
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = v_inv.id;

  perform public.write_audit(
    v_inv.family_id, 'member_joined'::public.audit_action, 'invitations', v_inv.id);

  return v_member;
end; $$;

-- Memberships now flow only through accept_invitation or admin writes.
drop policy if exists members_self_insert on public.family_members;
