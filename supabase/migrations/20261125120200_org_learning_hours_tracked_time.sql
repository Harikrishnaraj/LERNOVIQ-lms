-- Report audit C9, C42, C49, C22: organization "Learning hours" (and the org report CSV's
-- total_learning_hours) summed lesson_progress.last_position_seconds -- video resume positions,
-- not time spent -- over every enrollment a member ever had. It now sums tracked learning time
-- (lesson_time, written by record_lesson_time, 20261018100000_learning_time.sql).
--
-- Scope: courses do not belong to an organization in the schema (enrollments have no
-- organization, and assigned_learning lists only some of the courses an org's members take), so
-- this is all of the current members' tracked time, counted from the day each member joined the
-- organization (time from before they joined is not the organization's).
--
-- Latest definition: 20260928200000_admin_organizations.sql. Only learning_hours changes.
create or replace function public.admin_organization_detail(p_org_id uuid)
returns table (
  id uuid,
  name text,
  slug text,
  created_at timestamptz,
  member_count bigint,
  learning_hours numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.has_permission('organizations.manage') or public.is_org_admin(p_org_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select o.id, o.name, o.slug, o.created_at,
         (select count(*) from public.organization_members m where m.organization_id = o.id),
         coalesce((
           select round(sum(t.seconds) / 3600.0, 1)
             from public.organization_members m
             join public.enrollments e on e.user_id = m.user_id
             join public.lesson_time t on t.enrollment_id = e.id
            where m.organization_id = o.id
              and t.day >= (m.created_at at time zone 'utc')::date
         ), 0)
    from public.organizations o
   where o.id = p_org_id;
end;
$$;
revoke all on function public.admin_organization_detail(uuid) from public, anon;
grant execute on function public.admin_organization_detail(uuid) to authenticated;
