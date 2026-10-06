-- T-252: manual grading of essay/coding assessment attempts (F-107).
-- An attempt with an essay or coding question is stored as 'submitted' with passed = null until
-- the course's instructor scores those questions. The grade is written server-side with the
-- service role after an ownership check (like every other attempt write), so no new RLS policy is
-- needed: the learner and the course owner can already read the attempt.

alter table public.assessment_attempts
  add column manual_scores jsonb not null default '{}'::jsonb, -- { "<question_id>": { "points": int, "feedback": text } }
  add column feedback text not null default '' check (char_length(feedback) <= 10000),
  add column graded_by uuid references public.profiles (id) on delete set null,
  add column graded_at timestamptz;

-- The instructor's grading queue: attempts on the caller's own courses whose assessment has an
-- essay or coding question, awaiting grading first, oldest first.
create function public.instructor_assessment_grading_queue()
returns table (
  attempt_id uuid, assessment_id uuid, assessment_title text, course_id uuid, course_title text,
  learner_name text, attempt_number int, submitted_at timestamptz, status text, percent numeric, passed boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select att.id, a.id, a.title, c.id, v.title,
         coalesce(nullif(trim(p.full_name), ''), 'A learner'),
         att.attempt_number, att.submitted_at, att.status, att.percent, att.passed
    from public.assessment_attempts att
    join public.assessments a on a.id = att.assessment_id
    join public.course_versions v on v.id = a.version_id
    join public.courses c on c.id = v.course_id
    left join public.profiles p on p.id = att.user_id
   where c.instructor_id = auth.uid()
     and att.status in ('submitted', 'graded')
     and exists (
       select 1 from public.assessment_questions q
        where q.assessment_id = a.id and q.type in ('essay', 'coding')
     )
   order by (att.status = 'graded'), att.submitted_at
   limit 500;
$$;
revoke all on function public.instructor_assessment_grading_queue() from public, anon;
grant execute on function public.instructor_assessment_grading_queue() to authenticated;

-- Averages and pass rates now count graded attempts only. Before this, attempts still in progress
-- or awaiting grading (auto-graded part only, passed = null) dragged scores and pass rates down.
-- The bodies are unchanged apart from "and att.status = 'graded'" on the attempts join.

create or replace function public.admin_assessment_analytics(p_course_id uuid default null)
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
  if not public.has_permission('course.read_all') then
    raise exception 'not allowed' using errcode = '42501';
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
     where p_course_id is null or c.id = p_course_id
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
    left join public.assessment_attempts att on att.assessment_id = a.id and att.status = 'graded'
   group by a.id, a.title, sc.course_id, sc.course_title, a.pass_mark, a.position
   order by sc.course_title asc, a.position asc;
end;
$$;

create or replace function public.admin_question_analytics(p_course_id uuid default null)
returns table (
  question_id uuid,
  prompt text,
  assessment_id uuid,
  assessment_title text,
  course_id uuid,
  course_title text,
  question_type text,
  points int,
  total_attempts int,
  pass_rate int,
  difficulty text,
  quality_flag text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('course.read_all') then
    raise exception 'not allowed' using errcode = '42501';
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
     where p_course_id is null or c.id = p_course_id
  ),
  q_stats as (
    select q.id as q_id,
           q.prompt as q_prompt,
           a.id as a_id,
           a.title as a_title,
           sc.course_id as c_id,
           sc.course_title as c_title,
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
      left join public.assessment_attempts att on att.assessment_id = a.id and att.status = 'graded'
     group by q.id, q.prompt, a.id, a.title, sc.course_id, sc.course_title, q.type, q.points, q.position
     order by sc.course_title asc, a.title asc, q.position asc
  )
  select q_id,
         q_prompt,
         a_id,
         a_title,
         c_id,
         c_title,
         q_type,
         q_points,
         q_attempts,
         q_pass_rate,
         case
           when q_pass_rate >= 80 then 'easy'
           when q_pass_rate >= 50 then 'medium'
           else 'hard'
         end as difficulty,
         case
           when q_attempts >= 5 and q_pass_rate = 0 then 'review_too_hard'
           when q_attempts >= 5 and q_pass_rate = 100 then 'review_too_easy'
           else null
         end as quality_flag
    from q_stats;
end;
$$;

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
    left join public.assessment_attempts att on att.assessment_id = a.id and att.status = 'graded'
   group by a.id, a.title, sc.course_id, sc.course_title, a.pass_mark, a.position
   order by sc.course_title asc, a.position asc;
end;
$$;

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
      left join public.assessment_attempts att on att.assessment_id = a.id and att.status = 'graded'
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
