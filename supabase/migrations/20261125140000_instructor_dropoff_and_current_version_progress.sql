-- Report audit C44, C8 (instructor analytics). Latest definitions copied from
-- 20261125120100_instructor_analytics_accuracy.sql; only the lines each fix needs change.
--   C44 Drop-off rate was 100 minus the completion rate, so learners still in progress counted as
--       dropped off. It is now learners who started the lesson, have not completed it and have had
--       no activity on it for 14 days, divided by learners who started it.
--   C8  Lessons completed / progress counted lesson_progress from a previous version after a
--       re-enrolment, so progress could pass 100%. Only the current version's lessons count now.

-- 1. Lesson and video analytics (return columns unchanged). starts / completions count lesson
--    progress touched in the range. drop_off_rate (C44) is not limited to the range: of every
--    learner (non-cancelled enrollment) who ever started the lesson, the ones who have not completed
--    it and have had no activity on it (lesson_progress.updated_at) for 14 days, as a percentage.
--    Learners still working on a lesson are not dropped off.
create or replace function public.instructor_lesson_analytics(
  p_days int default 30,
  p_course_id uuid default null
)
returns table (
  lesson_id uuid,
  lesson_title text,
  lesson_type text,
  section_title text,
  course_id uuid,
  course_title text,
  version_number int,
  lesson_position int,
  duration_minutes int,
  starts int,
  completions int,
  completion_rate int,
  drop_off_rate int,
  avg_watch_seconds int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
  v_start date := current_date - (v_days - 1);
begin
  if p_course_id is not null and not exists (
    select 1 from public.courses where id = p_course_id and instructor_id = auth.uid()
  ) then
    return;
  end if;

  return query
  with scoped_versions as (
    select c.id as course_id,
           coalesce(cur.title, 'Untitled course') as course_title,
           v.id as version_id,
           v.version_number as v_number
      from public.courses c
      left join public.course_versions cur on cur.id = coalesce(c.published_version_id, (
        select v2.id from public.course_versions v2 where v2.course_id = c.id order by v2.version_number desc limit 1
      ))
      join public.course_versions v on v.course_id = c.id
     where c.instructor_id = auth.uid()
       and (p_course_id is null or c.id = p_course_id)
       and (v.id = cur.id or exists (
         select 1 from public.enrollments ev where ev.version_id = v.id and ev.status <> 'cancelled'
       ))
  ),
  lesson_stats as (
    select l.id as l_id,
           l.title as l_title,
           l.type as l_type,
           s.title as s_title,
           sv.course_id as c_id,
           sv.course_title as c_title,
           sv.v_number,
           s.position as s_pos,
           l.position as l_pos,
           l.duration_minutes as l_dur,
           count(lp.id)::int as l_starts,
           count(lp.id) filter (where lp.completed_at is not null)::int as l_comps,
           (select count(*)::int from public.lesson_progress ap
              join public.enrollments ae on ae.id = ap.enrollment_id and ae.status <> 'cancelled'
             where ap.lesson_id = l.id) as l_all_starts,
           (select count(*)::int from public.lesson_progress ap
              join public.enrollments ae on ae.id = ap.enrollment_id and ae.status <> 'cancelled'
             where ap.lesson_id = l.id and ap.completed_at is null
               and ap.updated_at < now() - interval '14 days') as l_drops,
           coalesce(round(avg(lp.last_position_seconds)), 0)::int as l_avg_pos
      from scoped_versions sv
      join public.course_sections s on s.version_id = sv.version_id
      join public.lessons l on l.section_id = s.id
      left join (
        public.lesson_progress lp
        join public.enrollments e on e.id = lp.enrollment_id and e.status <> 'cancelled'
      ) on lp.lesson_id = l.id and lp.updated_at::date >= v_start
     group by l.id, l.title, l.type, s.title, sv.course_id, sv.course_title, sv.v_number, s.position, l.position, l.duration_minutes
  )
  select l_id,
         l_title,
         l_type,
         s_title,
         c_id,
         c_title,
         v_number,
         l_pos,
         l_dur,
         l_starts,
         l_comps,
         case
           when l_starts = 0 then 0
           else round((l_comps::numeric / l_starts::numeric) * 100)::int
         end,
         case
           when l_all_starts = 0 then 0
           else round((l_drops::numeric / l_all_starts::numeric) * 100)::int
         end,
         l_avg_pos
    from lesson_stats
   order by c_title asc, v_number desc, s_pos asc, l_pos asc;
end;
$$;
revoke all on function public.instructor_lesson_analytics(int, uuid) from public, anon;
grant execute on function public.instructor_lesson_analytics(int, uuid) to authenticated;

-- 2. Learner roster for the CSV export (return columns unchanged). completed_lessons and
--    progress_percent (C8) count only completed lessons of the enrollment's current version: after a
--    re-enrolment onto a new version, progress on the old version's lessons no longer counts.
--    Otherwise as before. Learner roster for the CSV export: enrollments that started or completed, or had lesson
--    progress, an assessment attempt or tracked learning time, in the range. The other columns describe the
--    enrollment as it is now (all-time), e.g. learning_time_minutes is all tracked time.
create or replace function public.instructor_analytics_export_rows(
  p_days int default 30,
  p_course_id uuid default null
)
returns table (
  learner_name text,
  course_title text,
  status text,
  enrolled_at timestamptz,
  completed_at timestamptz,
  progress_percent int,
  completed_lessons int,
  total_lessons int,
  learning_time_minutes int,
  assessments_passed int,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
  v_start date := current_date - (v_days - 1);
begin
  if p_course_id is not null and not exists (
    select 1 from public.courses where id = p_course_id and instructor_id = auth.uid()
  ) then
    return;
  end if;

  return query
  select coalesce(nullif(trim(p.full_name), ''), 'A learner') as learner_name,
         v.title as course_title,
         e.status,
         e.enrolled_at,
         e.completed_at,
         case
           when (select count(*)::int from public.lessons l join public.course_sections s on s.id = l.section_id where s.version_id = e.version_id) = 0 then 0
           else round((
             (select count(*)::numeric from public.lesson_progress lp
               join public.lessons l on l.id = lp.lesson_id
               join public.course_sections s on s.id = l.section_id
              where lp.enrollment_id = e.id and lp.completed_at is not null and s.version_id = e.version_id) /
             (select count(*)::numeric from public.lessons l join public.course_sections s on s.id = l.section_id where s.version_id = e.version_id)
           ) * 100)::int
         end as progress_percent,
         (select count(*)::int from public.lesson_progress lp
            join public.lessons l on l.id = lp.lesson_id
            join public.course_sections s on s.id = l.section_id
           where lp.enrollment_id = e.id and lp.completed_at is not null and s.version_id = e.version_id) as completed_lessons,
         (select count(*)::int from public.lessons l join public.course_sections s on s.id = l.section_id where s.version_id = e.version_id) as total_lessons,
         coalesce((select round(sum(t.seconds) / 60.0)::int from public.lesson_time t where t.enrollment_id = e.id), 0) as learning_time_minutes,
         (select count(distinct att.assessment_id)::int from public.assessment_attempts att where att.enrollment_id = e.id and att.passed is true) as assessments_passed,
         greatest(
           (select max(lp.updated_at) from public.lesson_progress lp where lp.enrollment_id = e.id),
           (select max(att.started_at) from public.assessment_attempts att where att.enrollment_id = e.id),
           (select max(t.updated_at) from public.lesson_time t where t.enrollment_id = e.id)
         ) as last_activity_at
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    join public.course_versions v on v.id = e.version_id
    left join public.profiles p on p.id = e.user_id
   where c.instructor_id = auth.uid()
     and (p_course_id is null or c.id = p_course_id)
     and e.status <> 'cancelled'
     and (
       e.enrolled_at::date >= v_start
       or e.completed_at::date >= v_start
       or exists (select 1 from public.lesson_progress lp where lp.enrollment_id = e.id and lp.updated_at::date >= v_start)
       or exists (select 1 from public.assessment_attempts att where att.enrollment_id = e.id and att.started_at::date >= v_start)
       or exists (select 1 from public.lesson_time t where t.enrollment_id = e.id and t.day >= v_start)
     )
   order by v.title asc, e.enrolled_at desc, e.id asc;
end;
$$;
revoke all on function public.instructor_analytics_export_rows(int, uuid) from public, anon;
grant execute on function public.instructor_analytics_export_rows(int, uuid) to authenticated;
