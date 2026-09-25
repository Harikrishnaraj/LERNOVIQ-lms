-- T-103: the learners enrolled in the caller's own courses, with progress (F-213). Hard-wired to
-- auth.uid() as the course owner. Only display names are returned (no emails).

create function public.instructor_students()
returns table (
  enrollment_id uuid,
  user_id uuid,
  learner_name text,
  course_id uuid,
  course_title text,
  status text,
  enrolled_at timestamptz,
  completed_at timestamptz,
  completed_lessons int,
  total_lessons int,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.user_id,
         coalesce(nullif(trim(p.full_name), ''), 'A learner'),
         c.id,
         v.title,
         e.status,
         e.enrolled_at,
         e.completed_at,
         (select count(*)::int from public.lesson_progress lp where lp.enrollment_id = e.id and lp.completed_at is not null),
         (select count(*)::int from public.lessons l join public.course_sections s on s.id = l.section_id where s.version_id = e.version_id),
         (select max(lp.updated_at) from public.lesson_progress lp where lp.enrollment_id = e.id)
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    join public.course_versions v on v.id = e.version_id
    left join public.profiles p on p.id = e.user_id
   where c.instructor_id = auth.uid() and e.status <> 'cancelled'
   order by e.enrolled_at desc
   limit 2000;
$$;
revoke all on function public.instructor_students() from public, anon;
grant execute on function public.instructor_students() to authenticated;
