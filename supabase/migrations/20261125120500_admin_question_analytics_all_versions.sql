-- Report audit C7, C39 (admin part): admin_question_analytics only read the current course
-- version, so learners still on an older version were missing from the question-quality flags.
-- Like the instructor functions (20261125120100), it now returns one row per question per version
-- (the current version, plus any older version with a non-cancelled enrollment), labelled with
-- version_number. course_title is the current version's title for every row.
--
-- Latest definition copied from 20261125120000_question_difficulty_per_question.sql. The return
-- columns gain version_number, so the function is dropped and re-granted.

drop function if exists public.admin_question_analytics(uuid);

create function public.admin_question_analytics(p_course_id uuid default null)
returns table (
  question_id uuid,
  prompt text,
  assessment_id uuid,
  assessment_title text,
  course_id uuid,
  course_title text,
  version_number int,
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
  with scoped_versions as (
    select c.id as course_id,
           coalesce(cur.title, 'Untitled course') as course_title,
           v.id as version_id,
           v.version_number as v_number
      from public.courses c
      join public.course_versions cur on cur.id = coalesce(c.published_version_id, (
        select v2.id from public.course_versions v2 where v2.course_id = c.id order by v2.version_number desc limit 1
      ))
      join public.course_versions v on v.course_id = c.id
     where (p_course_id is null or c.id = p_course_id)
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
           sv.course_title as c_title,
           sv.v_number,
           q.type as q_type,
           q.points as q_points,
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
      ) r on true
     group by q.id, q.prompt, a.id, a.title, sv.course_id, sv.course_title, sv.v_number, q.type, q.points, q.position
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
         c_title,
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
         end as difficulty,
         case
           when q_answers >= 5 and q_pass_rate = 0 then 'review_too_hard'
           when q_answers >= 5 and q_pass_rate = 100 then 'review_too_easy'
           else null
         end as quality_flag
    from q_rates
   order by c_title asc, v_number desc, a_title asc, q_pos asc;
end;
$$;
revoke all on function public.admin_question_analytics(uuid) from public, anon;
grant execute on function public.admin_question_analytics(uuid) to authenticated;
