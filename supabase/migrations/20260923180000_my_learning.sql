-- T-035: saved courses + My Learning data.

create table public.saved_courses (
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
alter table public.saved_courses enable row level security;
create policy "read own saved courses" on public.saved_courses
  for select to authenticated using (user_id = auth.uid());
create policy "save published courses" on public.saved_courses
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.courses c where c.id = course_id and c.published_version_id is not null)
  );
create policy "unsave own courses" on public.saved_courses
  for delete to authenticated using (user_id = auth.uid());
revoke all on public.saved_courses from anon, authenticated;
grant select, delete on public.saved_courses to authenticated;
grant insert (user_id, course_id) on public.saved_courses to authenticated;

-- ADR-011: a learner keeps access to the exact version they enrolled in, even after the
-- course publishes a newer version.
create or replace function public.can_read_version(p_version_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.version_is_published(p_version_id)
      or public.has_permission('course.read_all')
      or exists (
        select 1 from public.course_versions v
         where v.id = p_version_id and public.owns_course(v.course_id)
      )
      or exists (
        select 1 from public.enrollments e
         where e.version_id = p_version_id and e.user_id = auth.uid() and e.status <> 'cancelled'
      );
$$;

-- The caller's enrollments with lesson progress. security definer only so the counts do not
-- depend on per-row RLS; it is hard-wired to auth.uid().
create function public.my_learning()
returns table (
  enrollment_id uuid,
  course_id uuid,
  slug text,
  title text,
  subtitle text,
  level text,
  duration_minutes int,
  status text,
  enrolled_at timestamptz,
  completed_at timestamptz,
  total_lessons int,
  completed_lessons int,
  last_activity timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, c.id, c.slug, v.title, v.subtitle, v.level, v.duration_minutes, e.status,
         e.enrolled_at, e.completed_at,
         (select count(*)::int from public.lessons l
            join public.course_sections s on s.id = l.section_id
           where s.version_id = e.version_id),
         (select count(*)::int from public.lesson_progress lp
            join public.lessons l on l.id = lp.lesson_id
            join public.course_sections s on s.id = l.section_id
           where lp.enrollment_id = e.id and lp.completed_at is not null and s.version_id = e.version_id),
         (select max(lp.updated_at) from public.lesson_progress lp where lp.enrollment_id = e.id)
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    join public.course_versions v on v.id = e.version_id
   where e.user_id = auth.uid() and e.status <> 'cancelled'
   order by coalesce((select max(lp.updated_at) from public.lesson_progress lp where lp.enrollment_id = e.id), e.enrolled_at) desc;
$$;
revoke execute on function public.my_learning() from public, anon;
grant execute on function public.my_learning() to authenticated;

create function public.my_saved_courses()
returns table (
  course_id uuid,
  slug text,
  title text,
  subtitle text,
  level text,
  duration_minutes int,
  price_cents int,
  currency text,
  saved_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.slug, v.title, v.subtitle, v.level, v.duration_minutes, v.price_cents, v.currency, sc.created_at
    from public.saved_courses sc
    join public.courses c on c.id = sc.course_id
    join public.course_versions v on v.id = c.published_version_id
   where sc.user_id = auth.uid()
   order by sc.created_at desc;
$$;
revoke execute on function public.my_saved_courses() from public, anon;
grant execute on function public.my_saved_courses() to authenticated;
