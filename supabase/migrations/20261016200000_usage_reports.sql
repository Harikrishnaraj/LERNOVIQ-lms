-- T-276: consolidated usage and product reports (F-420) on real data. Five read-only reports as
-- security-definer RPCs, gated like admin_analytics_daily: analytics.read, or the service role so
-- the scheduled-report cron can run them. "Module" means a lesson (the launchable unit); "library"
-- means a content-server licence (ADR-041), whose launches are recorded per event. None of them
-- returns an email or the hashed LMS learner key, only counts.

-- Consolidated: lessons accessed in the last p_days days (access date = lesson_progress.updated_at).
create function public.admin_report_module_usage(p_days int default 30)
returns table (
  course_id uuid, course_title text, section_title text, lesson_id uuid, lesson_title text,
  lesson_type text, learners_accessed int, learners_completed int, last_accessed_at timestamptz
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
  select v.course_id, v.title, s.title, l.id, l.title, l.type,
         count(distinct lp.enrollment_id)::int,
         (count(distinct lp.enrollment_id) filter (where lp.completed_at is not null))::int,
         max(lp.updated_at)
    from public.lesson_progress lp
    join public.lessons l on l.id = lp.lesson_id
    join public.course_sections s on s.id = l.section_id
    join public.course_versions v on v.id = s.version_id
   where lp.updated_at >= now() - make_interval(days => v_days)
   group by v.course_id, v.title, s.title, s.position, l.id, l.title, l.type, l.position
   order by v.title, s.position, l.position, l.id
   limit 10000;
end;
$$;
revoke all on function public.admin_report_module_usage(int) from public, anon;
grant execute on function public.admin_report_module_usage(int) to authenticated;

-- Product: every lesson of a course version that has enrolments, over all time.
create function public.admin_report_product_module_usage()
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
    left join public.lesson_progress lp on lp.lesson_id = l.id
   where exists (select 1 from public.enrollments e2 where e2.version_id = v.id)
   group by v.id, v.course_id, v.title, s.title, s.position, l.id, l.title, l.type, l.position
   order by v.title, s.position, l.position, l.id
   limit 10000;
end;
$$;
revoke all on function public.admin_report_product_module_usage() from public, anon;
grant execute on function public.admin_report_product_module_usage() to authenticated;

-- Consolidated: content-server launches per UTC day, licence and course in the last p_days days.
create function public.admin_report_library_usage(p_days int default 30)
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
         (select v.title from public.course_versions v where v.course_id = d.course_id order by v.version_number desc limit 1),
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
create function public.admin_report_product_library_usage()
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
         (select v.title from public.course_versions v where v.course_id = d.course_id order by v.version_number desc limit 1),
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

-- Product: one row per licence with its expiry, revocation and seat use. The status label is worked
-- out in TypeScript by licenceStatus() (content-server/rules.ts) so there is one definition of it.
create function public.admin_report_library_licence_status()
returns table (
  client_name text, licence_id uuid, licence_name text, expires_at timestamptz, revoked_at timestamptz,
  seat_limit int, seats_used int, courses int, created_at timestamptz
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
         li.id,
         li.name,
         li.expires_at,
         li.revoked_at,
         li.seat_limit,
         (select count(distinct r.learner_key)::int from public.content_registrations r where r.licence_id = li.id),
         (select count(*)::int from public.content_licence_courses lc where lc.licence_id = li.id),
         li.created_at
    from public.content_licences li
    join public.content_clients cl on cl.id = li.client_id
   order by cl.name, li.name, li.id
   limit 10000;
end;
$$;
revoke all on function public.admin_report_library_licence_status() from public, anon;
grant execute on function public.admin_report_library_licence_status() to authenticated;
