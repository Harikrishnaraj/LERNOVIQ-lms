-- Report audit C35, C5: question difficulty was the whole assessment's attempt pass rate, so every
-- question in an assessment got the same rating, and a question nobody had answered showed as
-- "100%, easy". Each question is now scored from its own answers in assessment_attempts.answers
-- against assessment_answer_keys (and, for essay/coding questions, the instructor's manual score),
-- with the same rules as src/features/assessments/grading.ts.
--
-- Counted answers: every submitted or graded attempt of the assessment answers each auto-graded
-- question (a skipped question counts as wrong, as in grading); an essay/coding question counts
-- only once the instructor has scored it. pass_rate is null with no answers; difficulty is null
-- ("Not enough data") below 5 answers.
--
-- instructor_question_analytics is redefined with the same rules in 20261125120100.

-- Whether one answer to one question is correct. Null when it cannot be decided yet (an essay or
-- coding question the instructor has not scored).
create function public.question_answer_correct(
  p_type text,
  p_points int,
  p_answer jsonb,
  p_correct_option_ids uuid[],
  p_accepted_answers text[],
  p_manual_score jsonb
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when p_type in ('essay', 'coding') then
      case
        when p_manual_score is null or jsonb_typeof(p_manual_score -> 'points') is distinct from 'number' then null
        else (p_manual_score ->> 'points')::numeric = p_points
      end
    when p_answer is null then false
    when p_type in ('mcq', 'true_false') then
      case
        when jsonb_typeof(p_answer) <> 'string' then false
        else coalesce(cardinality(p_correct_option_ids), 0) = 1
             and p_correct_option_ids[1]::text = (p_answer #>> '{}')
      end
    when p_type = 'multi' then
      case
        when jsonb_typeof(p_answer) <> 'array' or coalesce(cardinality(p_correct_option_ids), 0) = 0 then false
        else (select coalesce(array_agg(distinct x order by x), '{}') from jsonb_array_elements_text(p_answer) as x)
             = (select array_agg(distinct y::text order by y::text) from unnest(p_correct_option_ids) as y)
      end
    when p_type = 'short_answer' then
      case
        when jsonb_typeof(p_answer) <> 'string' then false
        when btrim(regexp_replace(p_answer #>> '{}', '\s+', ' ', 'g')) = '' then false
        else exists (
          select 1
            from unnest(coalesce(p_accepted_answers, '{}')) as a
           where lower(btrim(regexp_replace(a, '\s+', ' ', 'g')))
               = lower(btrim(regexp_replace(p_answer #>> '{}', '\s+', ' ', 'g')))
        )
      end
    else false
  end;
$$;
revoke all on function public.question_answer_correct(text, int, jsonb, uuid[], text[], jsonb) from public, anon;
grant execute on function public.question_answer_correct(text, int, jsonb, uuid[], text[], jsonb) to authenticated;

-- Latest definition: 20261006100000_assessment_manual_grading.sql. Only q_stats and the
-- pass_rate / difficulty / quality_flag expressions change; the return columns are the same
-- (total_attempts now counts this question's answers).
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
           q.position as q_pos,
           count(r.correct)::int as q_answers,
           count(*) filter (where r.correct)::int as q_correct
      from scoped_courses sc
      join public.assessments a on a.version_id = sc.version_id
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
     group by q.id, q.prompt, a.id, a.title, sc.course_id, sc.course_title, q.type, q.points, q.position
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
   order by c_title asc, a_title asc, q_pos asc;
end;
$$;
revoke all on function public.admin_question_analytics(uuid) from public, anon;
grant execute on function public.admin_question_analytics(uuid) to authenticated;
