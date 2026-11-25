-- Report audit fixes for the instructor analytics screen:
--   C6, C37, C52  "Active learners": a learner is active in the range when they updated lesson
--                 progress, started an assessment attempt, or have tracked learning time
--                 (lesson_time) in it. A bare enrollment no longer counts. The overview total is a
--                 DISTINCT count across all the instructor's courses (instructor_analytics_active_learners),
--                 not a sum of the per-course counts. Daily, per-course and total use one definition
--                 (instructor_activity).
--   C36, C53      Completion rate is a cohort rate: of the non-cancelled enrollments that started in
--                 the range, how many have completed. It can no longer exceed 100%.
--   C7, C39       Lesson, assessment and question analytics cover every version of a course that has
--                 learners, not only the current version. Versions copy lessons and assessments under
--                 new ids, so there is no stable key to merge them by: the functions return one row per
--                 lesson / assessment / question per version (the current version, plus any older
--                 version with a non-cancelled enrollment), labelled with version_number.
--   C38, C51, C13 The lesson, assessment, question and CSV export functions take p_days and filter
--                 activity to the range (lesson_progress.updated_at, assessment_attempts.started_at).
--                 The export roster lists enrollments that started, completed or had activity in the range.
--   C35, C5       Question difficulty is per question (see 20261125120000).
--   C54, C14, C42 Export "assessments_passed" counts distinct assessments passed; watch time
--                 (video positions) is replaced by tracked learning time (lesson_time), in minutes.
--
-- Latest definitions copied from 20260926110000_instructor_analytics.sql (daily, breakdown),
-- 20261006100000_assessment_manual_grading.sql (assessment, question) and
-- 20260926120000_instructor_extended_analytics.sql (lesson, export).

-- 1. Who was active, on which day, in which of the caller's courses. Internal helper for the
--    functions below; scoped to auth.uid()'s own courses.
create function public.instructor_activity(p_start date, p_course_id uuid default null)
returns table (course_id uuid, user_id uuid, day date)
language sql
stable
security definer
set search_path = public
as $$
  select e.course_id, e.user_id, lp.updated_at::date
    from public.lesson_progress lp
    join public.enrollments e on e.id = lp.enrollment_id
    join public.courses c on c.id = e.course_id
   where c.instructor_id = auth.uid()
     and (p_course_id is null or c.id = p_course_id)
     and lp.updated_at::date >= p_start
  union
  select e.course_id, a.user_id, a.started_at::date
    from public.assessment_attempts a
    join public.enrollments e on e.id = a.enrollment_id
    join public.courses c on c.id = e.course_id
   where c.instructor_id = auth.uid()
     and (p_course_id is null or c.id = p_course_id)
     and a.started_at::date >= p_start
  union
  select e.course_id, e.user_id, t.day
    from public.lesson_time t
    join public.enrollments e on e.id = t.enrollment_id
    join public.courses c on c.id = e.course_id
   where c.instructor_id = auth.uid()
     and (p_course_id is null or c.id = p_course_id)
     and t.day >= p_start;
$$;
revoke all on function public.instructor_activity(date, uuid) from public, anon, authenticated;

-- 2. Daily trend points (return columns unchanged).
create or replace function public.instructor_analytics_daily(
  p_days int default 30,
  p_course_id uuid default null
)
returns table (
  day date,
  enrollments int,
  completions int,
  active_learners int,
  revenue_cents int
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
  -- If course filter provided, ensure it belongs to the caller
  if p_course_id is not null and not exists (
    select 1 from public.courses where id = p_course_id and instructor_id = auth.uid()
  ) then
    -- Return nothing for unauthorized course
    return;
  end if;

  return query
  with days as (
    select d::date as day
      from generate_series(v_start, current_date, interval '1 day') as d
  ),
  scoped_courses as (
    select id from public.courses
     where instructor_id = auth.uid()
       and (p_course_id is null or id = p_course_id)
  ),
  day_enrollments as (
    select e.enrolled_at::date as day,
           count(*)::int as enrollments,
           coalesce(sum(coalesce(v.price_cents, 0)), 0)::int as revenue_cents
      from public.enrollments e
      join public.course_versions v on v.id = e.version_id
     where e.course_id in (select id from scoped_courses)
       and e.status <> 'cancelled'
       and e.enrolled_at::date >= v_start
     group by e.enrolled_at::date
  ),
  day_completions as (
    select e.completed_at::date as day,
           count(*)::int as completions
      from public.enrollments e
     where e.course_id in (select id from scoped_courses)
       and e.completed_at is not null
       and e.completed_at::date >= v_start
     group by e.completed_at::date
  ),
  day_activity as (
    select act.day, count(distinct act.user_id)::int as active_learners
      from public.instructor_activity(v_start, p_course_id) act
     group by act.day
  )
  select d.day,
         coalesce(de.enrollments, 0)::int as enrollments,
         coalesce(dc.completions, 0)::int as completions,
         coalesce(da.active_learners, 0)::int as active_learners,
         coalesce(de.revenue_cents, 0)::int as revenue_cents
    from days d
    left join day_enrollments de on de.day = d.day
    left join day_completions dc on dc.day = d.day
    left join day_activity da on da.day = d.day
   order by d.day;
end;
$$;
revoke all on function public.instructor_analytics_daily(int, uuid) from public, anon;
grant execute on function public.instructor_analytics_daily(int, uuid) to authenticated;

-- 3. Course breakdown (return columns unchanged). completions = enrollments that started in the
--    range and have completed, so completion_rate is at most 100.
create or replace function public.instructor_analytics_courses_breakdown(
  p_days int default 30,
  p_course_id uuid default null
)
returns table (
  course_id uuid,
  title text,
  slug text,
  enrollments int,
  completions int,
  completion_rate int,
  active_learners int,
  revenue_cents int
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
  with scoped_courses as (
    select c.id,
           coalesce(v.title, 'Untitled course') as title,
           c.slug
      from public.courses c
      left join public.course_versions v on v.id = coalesce(c.published_version_id, (
        select v2.id from public.course_versions v2 where v2.course_id = c.id order by v2.version_number desc limit 1
      ))
     where c.instructor_id = auth.uid()
       and (p_course_id is null or c.id = p_course_id)
  ),
  course_activity as (
    select act.course_id, count(distinct act.user_id)::int as active_learners
      from public.instructor_activity(v_start, p_course_id) act
     group by act.course_id
  ),
  cohort as (
    select sc.id,
           sc.title,
           sc.slug,
           count(e.id) filter (where e.enrolled_at::date >= v_start and e.status <> 'cancelled')::int as n_enrolled,
           count(e.id) filter (where e.enrolled_at::date >= v_start and e.status <> 'cancelled'
                                 and e.completed_at is not null)::int as n_completed,
           coalesce(sum(coalesce(cv.price_cents, 0)) filter (where e.enrolled_at::date >= v_start and e.status <> 'cancelled'), 0)::int as revenue
      from scoped_courses sc
      left join public.enrollments e on e.course_id = sc.id
      left join public.course_versions cv on cv.id = e.version_id
     group by sc.id, sc.title, sc.slug
  )
  select co.id as course_id,
         co.title,
         co.slug,
         co.n_enrolled as enrollments,
         co.n_completed as completions,
         case
           when co.n_enrolled = 0 then 0
           else round((co.n_completed::numeric / co.n_enrolled::numeric) * 100)::int
         end as completion_rate,
         coalesce(ca.active_learners, 0)::int as active_learners,
         co.revenue as revenue_cents
    from cohort co
    left join course_activity ca on ca.course_id = co.id
   order by co.n_enrolled desc, co.title asc;
end;
$$;
revoke all on function public.instructor_analytics_courses_breakdown(int, uuid) from public, anon;
grant execute on function public.instructor_analytics_courses_breakdown(int, uuid) to authenticated;

-- 4. Distinct active learners across all the caller's courses (or the one given) in the range.
create function public.instructor_analytics_active_learners(
  p_days int default 30,
  p_course_id uuid default null
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
  v_start date := current_date - (v_days - 1);
begin
  if auth.uid() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_course_id is not null and not exists (
    select 1 from public.courses where id = p_course_id and instructor_id = auth.uid()
  ) then
    return 0;
  end if;

  return (select count(distinct act.user_id)::int from public.instructor_activity(v_start, p_course_id) act);
end;
$$;
revoke all on function public.instructor_analytics_active_learners(int, uuid) from public, anon;
grant execute on function public.instructor_analytics_active_learners(int, uuid) to authenticated;

-- The functions below gain p_days and version_number, so the old signatures are dropped.
drop function if exists public.instructor_lesson_analytics(uuid);
drop function if exists public.instructor_assessment_analytics(uuid);
drop function if exists public.instructor_question_analytics(uuid);
drop function if exists public.instructor_analytics_export_rows(uuid);

-- 5. Lesson and video analytics: one row per lesson per version with learners. starts /
--    completions count lesson progress touched in the range.
create function public.instructor_lesson_analytics(
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
           when l_starts = 0 then 0
           else round(((l_starts - l_comps)::numeric / l_starts::numeric) * 100)::int
         end,
         l_avg_pos
    from lesson_stats
   order by c_title asc, v_number desc, s_pos asc, l_pos asc;
end;
$$;
revoke all on function public.instructor_lesson_analytics(int, uuid) from public, anon;
grant execute on function public.instructor_lesson_analytics(int, uuid) to authenticated;

-- 6. Assessment analytics: one row per assessment per version with learners; graded attempts
--    started in the range.
create function public.instructor_assessment_analytics(
  p_days int default 30,
  p_course_id uuid default null
)
returns table (
  assessment_id uuid,
  assessment_title text,
  course_id uuid,
  course_title text,
  version_number int,
  pass_mark int,
  total_attempts int,
  total_learners int,
  passed_attempts int,
  pass_rate int,
  avg_score numeric(5, 2),
  avg_attempts numeric(4, 2)
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
  )
  select a.id as assessment_id,
         a.title as assessment_title,
         sv.course_id,
         sv.course_title,
         sv.v_number as version_number,
         a.pass_mark,
         count(att.id)::int as total_attempts,
         count(distinct att.user_id)::int as total_learners,
         count(att.id) filter (where att.passed is true)::int as passed_attempts,
         case
           when count(att.id) = 0 then 0
           else round((count(att.id) filter (where att.passed is true)::numeric / count(att.id)::numeric) * 100)::int
         end as pass_rate,
         coalesce(round(avg(att.percent), 2), 0)::numeric(5, 2) as avg_score,
         case
           when count(distinct att.user_id) = 0 then 0
           else round((count(att.id)::numeric / count(distinct att.user_id)::numeric), 2)::numeric(4, 2)
         end as avg_attempts
    from scoped_versions sv
    join public.assessments a on a.version_id = sv.version_id
    left join public.assessment_attempts att
      on att.assessment_id = a.id and att.status = 'graded' and att.started_at::date >= v_start
   group by a.id, a.title, sv.course_id, sv.course_title, sv.v_number, a.pass_mark, a.position
   order by sv.course_title asc, sv.v_number desc, a.position asc;
end;
$$;
revoke all on function public.instructor_assessment_analytics(int, uuid) from public, anon;
grant execute on function public.instructor_assessment_analytics(int, uuid) to authenticated;

-- 7. Question difficulty: per-question correctness (question_answer_correct) over submitted or
--    graded attempts started in the range. pass_rate is null with no answers; difficulty is null
--    ("Not enough data") below 5 answers.
create function public.instructor_question_analytics(
  p_days int default 30,
  p_course_id uuid default null
)
returns table (
  question_id uuid,
  prompt text,
  assessment_id uuid,
  assessment_title text,
  course_id uuid,
  version_number int,
  question_type text,
  points int,
  total_attempts int,
  pass_rate int,
  difficulty text
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
  q_stats as (
    select q.id as q_id,
           q.prompt as q_prompt,
           a.id as a_id,
           a.title as a_title,
           sv.course_id as c_id,
           sv.v_number,
           q.type as q_type,
           q.points as q_points,
           a.position as a_pos,
           q.position as q_pos,
           count(r.correct)::int as q_answers,
           count(*) filter (where r.correct)::int as q_correct
      from scoped_versions sv
      join public.assessments a on a.version_id = sv.version_id
      join public.assessment_questions q on q.assessment_id = a.id
      left join public.assessment_answer_keys k on k.question_id = q.id
      left join lateral (
        select public.question_answer_correct(
                 q.type, q.points, att.answers -> q.id::text,
                 k.correct_option_ids, k.accepted_answers, att.manual_scores -> q.id::text
               ) as correct
          from public.assessment_attempts att
         where att.assessment_id = a.id
           and att.status in ('submitted', 'graded')
           and att.started_at::date >= v_start
      ) r on true
     group by q.id, q.prompt, a.id, a.title, sv.course_id, sv.v_number, q.type, q.points, a.position, q.position
  ),
  q_rates as (
    select qs.*,
           case
             when qs.q_answers = 0 then null
             else round((qs.q_correct::numeric / qs.q_answers::numeric) * 100)::int
           end as q_pass_rate
      from q_stats qs
  )
  select q_id,
         q_prompt,
         a_id,
         a_title,
         c_id,
         v_number,
         q_type,
         q_points,
         q_answers,
         q_pass_rate,
         case
           when q_answers < 5 then null
           when q_pass_rate >= 80 then 'easy'
           when q_pass_rate >= 50 then 'medium'
           else 'hard'
         end as difficulty
    from q_rates
   order by a_title asc, v_number desc, a_pos asc, q_pos asc;
end;
$$;
revoke all on function public.instructor_question_analytics(int, uuid) from public, anon;
grant execute on function public.instructor_question_analytics(int, uuid) to authenticated;

-- 8. Learner roster for the CSV export: enrollments that started or completed, or had lesson
--    progress, an assessment attempt or tracked learning time, in the range. The other columns describe the
--    enrollment as it is now (all-time), e.g. learning_time_minutes is all tracked time.
create function public.instructor_analytics_export_rows(
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
             (select count(*)::numeric from public.lesson_progress lp where lp.enrollment_id = e.id and lp.completed_at is not null) /
             (select count(*)::numeric from public.lessons l join public.course_sections s on s.id = l.section_id where s.version_id = e.version_id)
           ) * 100)::int
         end as progress_percent,
         (select count(*)::int from public.lesson_progress lp where lp.enrollment_id = e.id and lp.completed_at is not null) as completed_lessons,
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
