-- T-100: assignment builder (rubric) and the instructor grading queue (F-206).

create table public.assignment_rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  position int not null default 0,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  max_points int not null check (max_points between 1 and 1000)
);
create index assignment_rubric_idx on public.assignment_rubric_criteria (assignment_id, position);

alter table public.assignment_rubric_criteria enable row level security;
create policy "read rubric" on public.assignment_rubric_criteria for select to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and public.can_access_assessment_version(a.version_id)));
create policy "edit rubric" on public.assignment_rubric_criteria for all to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and public.can_edit_version(a.version_id)))
  with check (exists (select 1 from public.assignments a where a.id = assignment_id and public.can_edit_version(a.version_id)));

alter table public.assignment_submissions
  add column rubric_scores jsonb not null default '[]'::jsonb;

-- Replaces the rubric atomically. SECURITY INVOKER: the edit policy decides who may.
-- p_criteria: [{title, description, max_points}] in order.
create function public.set_assignment_rubric(p_assignment_id uuid, p_criteria jsonb)
returns void
language plpgsql
as $$
begin
  delete from public.assignment_rubric_criteria where assignment_id = p_assignment_id;
  insert into public.assignment_rubric_criteria (assignment_id, position, title, description, max_points)
  select p_assignment_id, (row_number() over ())::int - 1,
         c->>'title', coalesce(c->>'description', ''), (c->>'max_points')::int
    from jsonb_array_elements(coalesce(p_criteria, '[]'::jsonb)) as c;
end;
$$;
revoke all on function public.set_assignment_rubric(uuid, jsonb) from public, anon;
grant execute on function public.set_assignment_rubric(uuid, jsonb) to authenticated;

-- Grades (or re-grades) one submission. Only the course owner; the grade is bounded by the
-- assignment's points. Returns what the caller needs to notify the learner.
create function public.grade_assignment_submission(p_submission_id uuid, p_grade int, p_feedback text, p_scores jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.assignment_submissions;
  a public.assignments;
begin
  select * into s from public.assignment_submissions where id = p_submission_id;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  select * into a from public.assignments where id = s.assignment_id;
  if auth.uid() is null or not exists (
    select 1 from public.course_versions v where v.id = a.version_id and public.owns_course(v.course_id)
  ) then
    return jsonb_build_object('result', 'not_found');
  end if;
  if p_grade is null or p_grade < 0 or p_grade > a.max_points then
    return jsonb_build_object('result', 'bad_grade', 'max_points', a.max_points);
  end if;
  if char_length(coalesce(p_feedback, '')) > 10000 then
    return jsonb_build_object('result', 'bad_feedback');
  end if;
  update public.assignment_submissions
     set status = 'graded', grade = p_grade, feedback = coalesce(p_feedback, ''),
         rubric_scores = coalesce(p_scores, '[]'::jsonb), graded_by = auth.uid(), graded_at = now()
   where id = p_submission_id;
  return jsonb_build_object('result', 'ok', 'user_id', s.user_id, 'assignment_id', a.id, 'title', a.title);
end;
$$;
revoke all on function public.grade_assignment_submission(uuid, int, text, jsonb) from public, anon;
grant execute on function public.grade_assignment_submission(uuid, int, text, jsonb) to authenticated;

-- The grading queue: every submission on the caller's own courses, ungraded first.
create function public.instructor_grading_queue()
returns table (
  submission_id uuid, assignment_id uuid, assignment_title text, course_id uuid, course_title text,
  learner_name text, submitted_at timestamptz, is_late boolean, status text, grade int, max_points int
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, a.id, a.title, c.id, v.title,
         coalesce(nullif(trim(p.full_name), ''), 'A learner'),
         s.submitted_at, s.is_late, s.status, s.grade, a.max_points
    from public.assignment_submissions s
    join public.assignments a on a.id = s.assignment_id
    join public.course_versions v on v.id = a.version_id
    join public.courses c on c.id = v.course_id
    left join public.profiles p on p.id = s.user_id
   where c.instructor_id = auth.uid()
   order by (s.status = 'graded'), s.submitted_at
   limit 500;
$$;
revoke all on function public.instructor_grading_queue() from public, anon;
grant execute on function public.instructor_grading_queue() to authenticated;
