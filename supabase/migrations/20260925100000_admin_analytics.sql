-- T-077: basic platform analytics (F-412): daily enrollments, completions and sign-ups, plus the
-- most enrolled courses in the range. Counts only; requires analytics.read.

insert into public.permissions (id, description) values
  ('analytics.read', 'See platform analytics');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'analytics.read'),
  ('super_admin', 'analytics.read');

create function public.admin_analytics_daily(p_days int default 30)
returns table (day date, enrollments int, completions int, signups int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
begin
  if not public.has_permission('analytics.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select d::date,
         (select count(*)::int from public.enrollments e
           where e.enrolled_at::date = d::date and e.status <> 'cancelled'),
         (select count(*)::int from public.enrollments e
           where e.completed_at::date = d::date),
         (select count(*)::int from public.profiles p
           where p.created_at::date = d::date)
    from generate_series(current_date - (v_days - 1), current_date, interval '1 day') as d
   order by d;
end;
$$;
revoke all on function public.admin_analytics_daily(int) from public, anon;
grant execute on function public.admin_analytics_daily(int) to authenticated;

create function public.admin_top_courses(p_days int default 30, p_limit int default 5)
returns table (course_id uuid, title text, enrollments int, completions int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
begin
  if not public.has_permission('analytics.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select c.id,
         (select v.title from public.course_versions v where v.course_id = c.id order by v.version_number desc limit 1),
         count(*)::int,
         count(*) filter (where e.status = 'completed')::int
    from public.enrollments e
    join public.courses c on c.id = e.course_id
   where e.enrolled_at >= current_date - (v_days - 1) and e.status <> 'cancelled'
   group by c.id
   order by count(*) desc, c.id
   limit greatest(1, least(coalesce(p_limit, 5), 20));
end;
$$;
revoke all on function public.admin_top_courses(int, int) from public, anon;
grant execute on function public.admin_top_courses(int, int) to authenticated;
