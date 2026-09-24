-- T-050: the signed-in instructor own courses with the status of their LATEST version, learner
-- counts and rating. Hard-wired to auth.uid() (never another instructor), so it is safe as
-- security definer and avoids per-row RLS cost on the enrollment counts.
create function public.instructor_courses()
returns table (
  course_id uuid,
  slug text,
  title text,
  subtitle text,
  status text,
  version_number int,
  version_count int,
  level text,
  price_cents int,
  currency text,
  category_name text,
  updated_at timestamptz,
  is_live boolean,
  learners int,
  completions int,
  rating_avg numeric,
  rating_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.slug, v.title, v.subtitle, v.status, v.version_number,
         (select count(*)::int from public.course_versions x where x.course_id = c.id),
         v.level, v.price_cents, v.currency, cat.name,
         greatest(c.updated_at, v.updated_at),
         c.published_version_id is not null,
         (select count(*)::int from public.enrollments e where e.course_id = c.id and e.status <> 'cancelled'),
         (select count(*)::int from public.enrollments e where e.course_id = c.id and e.status = 'completed'),
         c.rating_avg, c.rating_count
    from public.courses c
    join lateral (
      select * from public.course_versions v2
       where v2.course_id = c.id
       order by v2.version_number desc
       limit 1
    ) v on true
    left join public.categories cat on cat.id = c.category_id
   where c.instructor_id = auth.uid()
   order by greatest(c.updated_at, v.updated_at) desc;
$$;
revoke execute on function public.instructor_courses() from public, anon;
grant execute on function public.instructor_courses() to authenticated;
