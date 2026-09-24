-- T-071: platform-wide counts for the admin overview (F-400). Counts only (no personal data), so
-- any back-office role may read them; the caller is checked inside the function.

create function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('portal.admin.access') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'users_suspended', (select count(*) from public.profiles where status = 'suspended'),
    'instructors', (select count(distinct user_id) from public.user_roles where role_id = 'instructor'),
    'courses_published', (select count(*) from public.courses where published_version_id is not null),
    'courses_pending_review', (select count(*) from public.course_versions where status in ('submitted', 'in_review')),
    'courses_changes_requested', (select count(*) from public.course_versions where status = 'changes_requested'),
    'enrollments_total', (select count(*) from public.enrollments where status <> 'cancelled'),
    'enrollments_7d', (select count(*) from public.enrollments where enrolled_at > now() - interval '7 days' and status <> 'cancelled'),
    'completions_total', (select count(*) from public.enrollments where status = 'completed'),
    'certificates_issued', (select count(*) from public.certificates)
  );
end;
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
