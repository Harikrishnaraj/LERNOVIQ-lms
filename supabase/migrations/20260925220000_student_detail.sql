-- T-104: one student's progress in one of the caller's courses (F-213): per lesson, assessment
-- attempts and assignment submissions. Only the course owner gets data; null otherwise.

create function public.instructor_student_detail(p_enrollment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e public.enrollments;
  c public.courses;
begin
  select * into e from public.enrollments where id = p_enrollment_id and status <> 'cancelled';
  if not found then return null; end if;
  select * into c from public.courses where id = e.course_id;
  if auth.uid() is null or c.instructor_id <> auth.uid() then return null; end if;

  return jsonb_build_object(
    'enrollment_id', e.id,
    'user_id', e.user_id,
    'name', coalesce((select nullif(trim(p.full_name), '') from public.profiles p where p.id = e.user_id), 'A learner'),
    'course_id', c.id,
    'course_title', (select v.title from public.course_versions v where v.id = e.version_id),
    'version_number', (select v.version_number from public.course_versions v where v.id = e.version_id),
    'status', e.status,
    'enrolled_at', e.enrolled_at,
    'completed_at', e.completed_at,
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lesson_id', l.id,
        'title', l.title,
        'type', l.type,
        'section', s.title,
        'duration_minutes', l.duration_minutes,
        'completed_at', lp.completed_at,
        'position_seconds', coalesce(lp.last_position_seconds, 0),
        'touched_at', lp.updated_at
      ) order by s.position, l.position)
      from public.lessons l
      join public.course_sections s on s.id = l.section_id and s.version_id = e.version_id
      left join public.lesson_progress lp on lp.lesson_id = l.id and lp.enrollment_id = e.id
    ), '[]'::jsonb),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'attempt_id', at.id,
        'assessment_title', a.title,
        'attempt_number', at.attempt_number,
        'status', at.status,
        'percent', at.percent,
        'passed', at.passed,
        'submitted_at', at.submitted_at
      ) order by at.started_at desc)
      from public.assessment_attempts at
      join public.assessments a on a.id = at.assessment_id
      where at.enrollment_id = e.id
    ), '[]'::jsonb),
    'submissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'submission_id', sb.id,
        'assignment_title', asg.title,
        'status', sb.status,
        'grade', sb.grade,
        'max_points', asg.max_points,
        'is_late', sb.is_late,
        'submitted_at', sb.submitted_at
      ) order by sb.submitted_at desc)
      from public.assignment_submissions sb
      join public.assignments asg on asg.id = sb.assignment_id and asg.version_id = e.version_id
      where sb.user_id = e.user_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.instructor_student_detail(uuid) from public, anon;
grant execute on function public.instructor_student_detail(uuid) to authenticated;
