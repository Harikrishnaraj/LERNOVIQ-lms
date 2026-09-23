-- T-036: access rules the course player depends on.

-- Enrolment grants the exact version enrolled in - not every version of the course (an
-- enrolled learner must never read the instructor's next draft).
create or replace function public.is_enrolled_in_version_course(p_version_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
     where e.version_id = p_version_id and e.user_id = auth.uid() and e.status <> 'cancelled'
  );
$$;

create function public.is_enrolled_in_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
     where e.course_id = p_course_id and e.user_id = auth.uid() and e.status <> 'cancelled'
  );
$$;
-- anon needs EXECUTE too: the courses SELECT policy is evaluated for anonymous catalog reads (returns false, auth.uid() is null).
grant execute on function public.is_enrolled_in_course(uuid) to anon, authenticated;

-- An enrolled learner can still read the course row after it is archived/unpublished.
drop policy "read courses" on public.courses;
create policy "read courses" on public.courses for select using (
  published_version_id is not null
  or instructor_id = auth.uid()
  or public.has_permission('course.read_all')
  or public.is_enrolled_in_course(id)
);

-- Outline (titles only, locked lessons included) for anyone who can read the version:
-- published for everyone, plus the owner, staff and enrolled learners.
create or replace function public.get_lesson_outline(p_version_id uuid)
returns table (id uuid, section_id uuid, title text, type text, "position" int, duration_minutes int, is_preview boolean)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.section_id, l.title, l.type, l.position, l.duration_minutes, l.is_preview
    from public.lessons l
    join public.course_sections s on s.id = l.section_id
   where s.version_id = p_version_id
     and public.can_read_version(p_version_id)
   order by s.position, l.position;
$$;
