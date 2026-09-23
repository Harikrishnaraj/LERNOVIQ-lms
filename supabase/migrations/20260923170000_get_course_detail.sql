-- T-033: public course page data. security definer only to expose the instructor display
-- name from profiles; returns a row only for a course that has a published version.
create function public.get_course_detail(p_slug text)
returns table (
  id uuid,
  slug text,
  version_id uuid,
  title text,
  subtitle text,
  description text,
  level text,
  language text,
  price_cents int,
  currency text,
  duration_minutes int,
  thumbnail_url text,
  outcomes text[],
  requirements text[],
  certificate_enabled boolean,
  rating_avg numeric,
  rating_count int,
  category_slug text,
  category_name text,
  instructor_name text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.slug, v.id, v.title, v.subtitle, v.description, v.level, v.language,
         v.price_cents, v.currency, v.duration_minutes, v.thumbnail_url, v.outcomes,
         v.requirements, v.certificate_enabled, c.rating_avg, c.rating_count,
         cat.slug, cat.name, p.full_name, v.published_at
    from public.courses c
    join public.course_versions v on v.id = c.published_version_id
    left join public.categories cat on cat.id = c.category_id
    left join public.profiles p on p.id = c.instructor_id
   where c.slug = p_slug;
$$;

grant execute on function public.get_course_detail(text) to anon, authenticated;
