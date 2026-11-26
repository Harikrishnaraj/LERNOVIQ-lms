-- Report audit C11, C57, C15 (admin usage reports). Latest definitions copied from
-- 20261016200000_usage_reports.sql and 20260925100000_admin_analytics.sql (admin_top_courses);
-- return columns unchanged.
--   C11, C57 Product module usage: learners_started / learners_completed count only progress of
--            non-cancelled enrollments on that version, the same population as learners_enrolled,
--            so started <= enrolled.
--   C15      Top courses and both library-usage reports title a course by its published version
--            (courses.published_version_id), falling back to the latest version only when the course
--            has never been published, so a draft's working title no longer leaks into them.

-- Product: every lesson of a course version that has enrolments, over all time.
create or replace function public.admin_report_product_module_usage()
returns table (
  course_id uuid, course_title text, section_title text, lesson_id uuid, lesson_title text,
  lesson_type text, learners_enrolled int, learners_started int, learners_completed int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not public.has_permission('analytics.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select v.course_id, v.title, s.title, l.id, l.title, l.type,
         (select count(*)::int from public.enrollments e where e.version_id = v.id and e.status <> 'cancelled'),
         count(distinct lp.enrollment_id)::int,
         (count(distinct lp.enrollment_id) filter (where lp.completed_at is not null))::int
    from public.lessons l
    join public.course_sections s on s.id = l.section_id
    join public.course_versions v on v.id = s.version_id
    -- Same population as learners_enrolled: progress of this version's non-cancelled enrollments (C11, C57).
    left join (
      public.lesson_progress lp
      join public.enrollments pe on pe.id = lp.enrollment_id and pe.status <> 'cancelled'
    ) on lp.lesson_id = l.id and pe.version_id = v.id
   where exists (select 1 from public.enrollments e2 where e2.version_id = v.id)
   group by v.id, v.course_id, v.title, s.title, s.position, l.id, l.title, l.type, l.position
   order by v.title, s.position, l.position, l.id
   limit 10000;
end;
$$;
revoke all on function public.admin_report_product_module_usage() from public, anon;
grant execute on function public.admin_report_product_module_usage() to authenticated;

-- Consolidated: content-server launches per UTC day, licence and course in the last p_days days.
create or replace function public.admin_report_library_usage(p_days int default 30)
returns table (
  day date, client_name text, licence_name text, course_id uuid, course_title text,
  launches int, learners int
)
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
  select (ev.launched_at at time zone 'utc')::date,
         cl.name,
         li.name,
         d.course_id,
         (select v.title from public.course_versions v
            join public.courses c on c.id = v.course_id
           where v.course_id = d.course_id
           order by (v.id = c.published_version_id) is true desc, v.version_number desc limit 1),
         count(*)::int,
         count(distinct ev.registration_id)::int
    from public.content_launch_events ev
    join public.content_dispatches d on d.id = ev.dispatch_id
    join public.content_licences li on li.id = ev.licence_id
    join public.content_clients cl on cl.id = li.client_id
   where ev.launched_at >= now() - make_interval(days => v_days)
   group by (ev.launched_at at time zone 'utc')::date, cl.name, li.name, d.course_id
   order by 1 desc, cl.name, li.name, d.course_id
   limit 10000;
end;
$$;
revoke all on function public.admin_report_library_usage(int) from public, anon;
grant execute on function public.admin_report_library_usage(int) to authenticated;

-- Product: totals per licence and course over all time (registrations, launches, first/last launch).
create or replace function public.admin_report_product_library_usage()
returns table (
  client_name text, licence_name text, course_id uuid, course_title text,
  registrations int, launches int, first_launch_at timestamptz, last_launch_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not public.has_permission('analytics.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select cl.name,
         li.name,
         d.course_id,
         (select v.title from public.course_versions v
            join public.courses c on c.id = v.course_id
           where v.course_id = d.course_id
           order by (v.id = c.published_version_id) is true desc, v.version_number desc limit 1),
         count(r.id)::int,
         coalesce(sum(r.launch_count), 0)::int,
         min(r.first_launch_at),
         max(r.last_launch_at)
    from public.content_dispatches d
    join public.content_licences li on li.id = d.licence_id
    join public.content_clients cl on cl.id = li.client_id
    left join public.content_registrations r on r.dispatch_id = d.id
   group by d.id, cl.name, li.name, d.course_id
   order by cl.name, li.name, d.course_id
   limit 10000;
end;
$$;
revoke all on function public.admin_report_product_library_usage() from public, anon;
grant execute on function public.admin_report_product_library_usage() to authenticated;

-- Admin dashboard: most enrolled courses in the range.
create or replace function public.admin_top_courses(p_days int default 30, p_limit int default 5)
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
         (select v.title from public.course_versions v where v.course_id = c.id
           order by (v.id = c.published_version_id) is true desc, v.version_number desc limit 1),
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
