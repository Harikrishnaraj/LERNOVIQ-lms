-- T-275: user reports (F-420) on real data. Two read-only reports as security-definer RPCs, gated like
-- admin_analytics_daily: analytics.read, or the service role so the scheduled-report cron can run them.
-- No email column: the reports carry the user id and display name only (data minimisation).
-- "User product duration" is not here: nothing records time spent yet (T-292).

-- Active users with no login, lesson-progress or assessment activity for at least p_days days.
create function public.admin_report_idle_users(p_days int default 30)
returns table (user_id uuid, full_name text, last_activity_at timestamptz, days_idle int, enrollments int)
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
  select p.id,
         p.full_name,
         a.last_at,
         (current_date - a.last_at::date)::int,
         (select count(*)::int from public.enrollments e where e.user_id = p.id and e.status <> 'cancelled')
    from public.profiles p
   cross join lateral (
     select greatest(
       p.created_at,
       coalesce((select max(l.created_at) from public.login_history l where l.user_id = p.id), p.created_at),
       coalesce((select max(lp.updated_at) from public.lesson_progress lp
                   join public.enrollments e on e.id = lp.enrollment_id where e.user_id = p.id), p.created_at),
       coalesce((select max(aa.started_at) from public.assessment_attempts aa where aa.user_id = p.id), p.created_at)
     ) as last_at
   ) a
   where p.status = 'active'
     and a.last_at < now() - make_interval(days => v_days)
   order by a.last_at, p.id
   limit 10000;
end;
$$;
revoke all on function public.admin_report_idle_users(int) from public, anon;
grant execute on function public.admin_report_idle_users(int) to authenticated;

-- One row per enrolment with activity (enrolled, progressed, attempted or completed) in the last
-- p_days days: lessons done, assessment results and certificate state.
create function public.admin_report_user_progress(p_days int default 30)
returns table (
  user_id uuid, full_name text, course_id uuid, course_title text, enrollment_status text,
  enrolled_at timestamptz, completed_at timestamptz, lessons_completed int, lessons_total int,
  assessments_passed int, assessments_total int, best_assessment_percent numeric,
  certificate_status text, last_activity_at timestamptz
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
  select e.user_id,
         p.full_name,
         e.course_id,
         v.title,
         e.status,
         e.enrolled_at,
         e.completed_at,
         (select count(*)::int from public.lesson_progress lp
           where lp.enrollment_id = e.id and lp.completed_at is not null),
         (select count(*)::int from public.lessons l
            join public.course_sections s on s.id = l.section_id where s.version_id = e.version_id),
         (select count(distinct aa.assessment_id)::int from public.assessment_attempts aa
           where aa.enrollment_id = e.id and aa.passed is true),
         (select count(*)::int from public.assessments a where a.version_id = e.version_id),
         (select max(aa.percent) from public.assessment_attempts aa
           where aa.enrollment_id = e.id and aa.status = 'graded'),
         (select c.status from public.certificates c where c.enrollment_id = e.id),
         act.last_at
    from public.enrollments e
    join public.profiles p on p.id = e.user_id
    join public.course_versions v on v.id = e.version_id
   cross join lateral (
     select greatest(
       e.enrolled_at,
       coalesce(e.completed_at, e.enrolled_at),
       coalesce((select max(lp.updated_at) from public.lesson_progress lp where lp.enrollment_id = e.id), e.enrolled_at),
       coalesce((select max(aa.started_at) from public.assessment_attempts aa where aa.enrollment_id = e.id), e.enrolled_at)
     ) as last_at
   ) act
   where act.last_at >= now() - make_interval(days => v_days)
   order by act.last_at desc, e.id
   limit 10000;
end;
$$;
revoke all on function public.admin_report_user_progress(int) from public, anon;
grant execute on function public.admin_report_user_progress(int) to authenticated;
