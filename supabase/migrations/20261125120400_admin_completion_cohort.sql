-- Report audit fix C53 (admin part): the admin analytics "Completion rate" divided completions
-- from any cohort by enrollments started in the range and was capped at 100% in the app. It is now
-- a cohort rate, matching the instructor screen (20261125120100): of the non-cancelled enrollments
-- that started in the range, how many have completed. It cannot exceed 100%, so the cap is gone.
-- Range and permission check copied from admin_analytics_daily (20260928320000).

create function public.admin_analytics_cohort(p_days int default 30)
returns table (enrollments int, completed int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not public.has_permission('analytics.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select count(*)::int,
         count(*) filter (where e.completed_at is not null)::int
    from public.enrollments e
   where e.enrolled_at::date >= current_date - (v_days - 1)
     and e.enrolled_at::date <= current_date
     and e.status <> 'cancelled';
end;
$$;

revoke all on function public.admin_analytics_cohort(int) from public, anon;
grant execute on function public.admin_analytics_cohort(int) to authenticated;
grant execute on function public.admin_analytics_cohort(int) to service_role;
