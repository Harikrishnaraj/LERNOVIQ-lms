-- T-084: the learner's own progress overview (F-114), computed from real lesson completions.
-- Hard-wired to auth.uid(); security definer only so counts do not depend on per-row policies.

create function public.my_progress()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select e.id as enrollment_id, e.course_id, e.version_id, e.status
      from public.enrollments e
     where e.user_id = auth.uid() and e.status <> 'cancelled'
  ),
  done as (
    select lp.completed_at, l.duration_minutes, m.course_id, m.enrollment_id
      from mine m
      join public.lesson_progress lp on lp.enrollment_id = m.enrollment_id and lp.completed_at is not null
      join public.lessons l on l.id = lp.lesson_id
  )
  select jsonb_build_object(
    'minutes', coalesce((select sum(duration_minutes) from done), 0),
    'lessons_completed', (select count(*) from done),
    'active_days', coalesce((
      select jsonb_agg(d order by d desc)
        from (select distinct (completed_at at time zone 'UTC')::date as d
                from done
               where completed_at > now() - interval '400 days') x
    ), '[]'::jsonb),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'course_id', c.id,
        'slug', c.slug,
        'title', v.title,
        'category', cat.name,
        'status', m.status,
        'total_lessons', (select count(*) from public.lessons l join public.course_sections s on s.id = l.section_id where s.version_id = m.version_id),
        'completed_lessons', (select count(*) from done d where d.enrollment_id = m.enrollment_id),
        'minutes', coalesce((select sum(d.duration_minutes) from done d where d.enrollment_id = m.enrollment_id), 0)
      ) order by v.title)
        from mine m
        join public.courses c on c.id = m.course_id
        join public.course_versions v on v.id = m.version_id
        left join public.categories cat on cat.id = c.category_id
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.my_progress() from public, anon;
grant execute on function public.my_progress() to authenticated;
