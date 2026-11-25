-- Report audit C8: the Individual user progress report counted completed lessons from a previous
-- course version after a re-enrolment moved the enrollment to a new version, so lessons_completed
-- could exceed lessons_total. Same function as 20261125100000_fix_user_progress_certificate.sql;
-- only lessons_completed changes, to count the current version's lessons only.

create or replace function public.admin_report_user_progress(p_days int default 30)
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
         -- Only lessons of the enrollment's current version (C8).
         (select count(*)::int from public.lesson_progress lp
            join public.lessons l on l.id = lp.lesson_id
            join public.course_sections s on s.id = l.section_id
           where lp.enrollment_id = e.id and lp.completed_at is not null and s.version_id = e.version_id),
         (select count(*)::int from public.lessons l
            join public.course_sections s on s.id = l.section_id where s.version_id = e.version_id),
         (select count(distinct aa.assessment_id)::int from public.assessment_attempts aa
           where aa.enrollment_id = e.id and aa.passed is true),
         (select count(*)::int from public.assessments a where a.version_id = e.version_id),
         (select max(aa.percent) from public.assessment_attempts aa
           where aa.enrollment_id = e.id and aa.status = 'graded'),
         -- One row: the live certificate if there is one, else the latest revoked one. After a revoke and
         -- reissue an enrolment has two rows, and a bare scalar subquery would fail the whole report.
         (select c.status from public.certificates c where c.enrollment_id = e.id
           order by (c.status <> 'revoked') desc, c.issued_at desc limit 1),
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
