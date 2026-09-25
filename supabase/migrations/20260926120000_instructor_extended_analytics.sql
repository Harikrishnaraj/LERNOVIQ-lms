-- T-108: Extended Instructor Analytics (F-216)
-- Video/lesson analytics (watch time, drop-off, completion by lesson)
-- Assessment analytics (pass rate, avg attempts, question difficulty)
-- Export data scoped to own courses

-- 1. Lesson and Video Analytics
create or replace function public.instructor_lesson_analytics(p_course_id uuid default null)
returns table (
  lesson_id uuid,
  lesson_title text,
  lesson_type text,
  section_title text,
  course_id uuid,
  course_title text,
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
begin
  if p_course_id is not null and not exists (
    select 1 from public.courses where id = p_course_id and instructor_id = auth.uid()
  ) then
    return;
  end if;

  return query
  with scoped_courses as (
    select c.id as course_id,
           coalesce(v.title, 'Untitled course') as course_title,
           v.id as version_id
      from public.courses c
      join public.course_versions v on v.id = coalesce(c.published_version_id, (
        select v2.id from public.course_versions v2 where v2.course_id = c.id order by v2.version_number desc limit 1
      ))
     where c.instructor_id = auth.uid()
       and (p_course_id is null or c.id = p_course_id)
  ),
  lesson_stats as (
    select l.id as l_id,
           l.title as l_title,
           l.type as l_type,
           s.title as s_title,
           sc.course_id as c_id,
           sc.course_title as c_title,
           l.position as l_pos,
           l.duration_minutes as l_dur,
           count(lp.id)::int as l_starts,
           count(lp.id) filter (where lp.completed_at is not null)::int as l_comps,
           coalesce(round(avg(lp.last_position_seconds)), 0)::int as l_avg_pos
      from scoped_courses sc
      join public.course_sections s on s.version_id = sc.version_id
      join public.lessons l on l.section_id = s.id
      left join public.enrollments e on e.course_id = sc.course_id and e.status <> 'cancelled'
      left join public.lesson_progress lp on lp.enrollment_id = e.id and lp.lesson_id = l.id
     group by l.id, l.title, l.type, s.title, sc.course_id, sc.course_title, l.position, s.position, l.duration_minutes
     order by sc.course_title asc, s.position asc, l.position asc
  )
  select l_id,
         l_title,
         l_type,
         s_title,
         c_id,
         c_title,
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
    from lesson_stats;
end;
$$;
revoke all on function public.instructor_lesson_analytics(uuid) from public, anon;
grant execute on function public.instructor_lesson_analytics(uuid) to authenticated;

-- 2. Assessment Analytics
create or replace function public.instructor_assessment_analytics(p_course_id uuid default null)
returns table (
  assessment_id uuid,
  assessment_title text,
  course_id uuid,
  course_title text,
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
begin
  if p_course_id is not null and not exists (
    select 1 from public.courses where id = p_course_id and instructor_id = auth.uid()
  ) then
    return;
  end if;

  return query
  with scoped_courses as (
    select c.id as course_id,
           coalesce(v.title, 'Untitled course') as course_title,
           v.id as version_id
      from public.courses c
      join public.course_versions v on v.id = coalesce(c.published_version_id, (
        select v2.id from public.course_versions v2 where v2.course_id = c.id order by v2.version_number desc limit 1
      ))
     where c.instructor_id = auth.uid()
       and (p_course_id is null or c.id = p_course_id)
  )
  select a.id as assessment_id,
         a.title as assessment_title,
         sc.course_id,
         sc.course_title,
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
    from scoped_courses sc
    join public.assessments a on a.version_id = sc.version_id
    left join public.assessment_attempts att on att.assessment_id = a.id
   group by a.id, a.title, sc.course_id, sc.course_title, a.pass_mark, a.position
   order by sc.course_title asc, a.position asc;
end;
$$;
revoke all on function public.instructor_assessment_analytics(uuid) from public, anon;
grant execute on function public.instructor_assessment_analytics(uuid) to authenticated;

-- 3. Question Difficulty and Quality Analytics
create or replace function public.instructor_question_analytics(p_course_id uuid default null)
returns table (
  question_id uuid,
  prompt text,
  assessment_id uuid,
  assessment_title text,
  course_id uuid,
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
begin
  if p_course_id is not null and not exists (
    select 1 from public.courses where id = p_course_id and instructor_id = auth.uid()
  ) then
    return;
  end if;

  return query
  with scoped_courses as (
    select c.id as course_id,
           v.id as version_id
      from public.courses c
      join public.course_versions v on v.id = coalesce(c.published_version_id, (
        select v2.id from public.course_versions v2 where v2.course_id = c.id order by v2.version_number desc limit 1
      ))
     where c.instructor_id = auth.uid()
       and (p_course_id is null or c.id = p_course_id)
  ),
  q_stats as (
    select q.id as q_id,
           q.prompt as q_prompt,
           a.id as a_id,
           a.title as a_title,
           sc.course_id as c_id,
           q.type as q_type,
           q.points as q_points,
           count(att.id)::int as q_attempts,
           case
             when count(att.id) = 0 then 100
             else round((count(att.id) filter (where att.passed is true)::numeric / count(att.id)::numeric) * 100)::int
           end as q_pass_rate
      from scoped_courses sc
      join public.assessments a on a.version_id = sc.version_id
      join public.assessment_questions q on q.assessment_id = a.id
      left join public.assessment_attempts att on att.assessment_id = a.id
     group by q.id, q.prompt, a.id, a.title, sc.course_id, q.type, q.points, q.position
     order by a.title asc, q.position asc
  )
  select q_id,
         q_prompt,
         a_id,
         a_title,
         c_id,
         q_type,
         q_points,
         q_attempts,
         q_pass_rate,
         case
           when q_pass_rate >= 80 then 'easy'
           when q_pass_rate >= 50 then 'medium'
           else 'hard'
         end as difficulty
    from q_stats;
end;
$$;
revoke all on function public.instructor_question_analytics(uuid) from public, anon;
grant execute on function public.instructor_question_analytics(uuid) to authenticated;

-- 4. Learner Engagement and Progress Rows for CSV Export
create or replace function public.instructor_analytics_export_rows(p_course_id uuid default null)
returns table (
  learner_name text,
  course_title text,
  status text,
  enrolled_at timestamptz,
  completed_at timestamptz,
  progress_percent int,
  completed_lessons int,
  total_lessons int,
  watch_time_minutes int,
  assessments_passed int,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
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
         coalesce((select round(sum(lp.last_position_seconds) / 60)::int from public.lesson_progress lp where lp.enrollment_id = e.id), 0) as watch_time_minutes,
         (select count(*)::int from public.assessment_attempts att where att.enrollment_id = e.id and att.passed is true) as assessments_passed,
         (select max(lp.updated_at) from public.lesson_progress lp where lp.enrollment_id = e.id) as last_activity_at
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    join public.course_versions v on v.id = e.version_id
    left join public.profiles p on p.id = e.user_id
   where c.instructor_id = auth.uid()
     and (p_course_id is null or c.id = p_course_id)
     and e.status <> 'cancelled'
   order by v.title asc, e.enrolled_at desc;
end;
$$;
revoke all on function public.instructor_analytics_export_rows(uuid) from public, anon;
grant execute on function public.instructor_analytics_export_rows(uuid) to authenticated;
