-- T-032: public catalog search. One RPC does full-text search (ADR-013), filters, sort and
-- pagination, and returns the total count so the UI can page. security definer because it joins
-- profiles for the instructor display name; it only ever exposes rows whose course has a
-- published version.
create function public.search_courses(
  p_query text default null,
  p_category text default null,
  p_level text default null,
  p_language text default null,
  p_min_minutes int default null,
  p_max_minutes int default null,
  p_price text default null, -- 'free' | 'paid'
  p_min_rating numeric default null,
  p_sort text default 'newest', -- relevance | newest | top_rated | price_low | price_high
  p_limit int default 12,
  p_offset int default 0
)
returns table (
  id uuid,
  slug text,
  title text,
  subtitle text,
  level text,
  language text,
  price_cents int,
  currency text,
  duration_minutes int,
  thumbnail_url text,
  rating_avg numeric,
  rating_count int,
  category_slug text,
  category_name text,
  instructor_name text,
  published_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select case when coalesce(btrim(p_query), '') = '' then null
                else websearch_to_tsquery('english', p_query) end as tsq
  )
  select c.id, c.slug, v.title, v.subtitle, v.level, v.language, v.price_cents, v.currency,
         v.duration_minutes, v.thumbnail_url, c.rating_avg, c.rating_count,
         cat.slug, cat.name, p.full_name, v.published_at,
         count(*) over () as total_count
    from public.courses c
    join public.course_versions v on v.id = c.published_version_id
    left join public.categories cat on cat.id = c.category_id
    left join public.profiles p on p.id = c.instructor_id
    cross join q
   where (q.tsq is null or v.search @@ q.tsq)
     and (p_category is null or cat.slug = p_category)
     and (p_level is null or v.level = p_level)
     and (p_language is null or v.language = p_language)
     and (p_min_minutes is null or v.duration_minutes >= p_min_minutes)
     and (p_max_minutes is null or v.duration_minutes < p_max_minutes)
     and (p_price is null
          or (p_price = 'free' and v.price_cents = 0)
          or (p_price = 'paid' and v.price_cents > 0))
     and (p_min_rating is null or c.rating_avg >= p_min_rating)
   order by
     (case when p_sort = 'relevance' and q.tsq is not null then ts_rank(v.search, q.tsq) end) desc nulls last,
     (case when p_sort = 'top_rated' then c.rating_avg end) desc nulls last,
     (case when p_sort = 'top_rated' then c.rating_count end) desc nulls last,
     (case when p_sort = 'price_low' then v.price_cents end) asc nulls last,
     (case when p_sort = 'price_high' then v.price_cents end) desc nulls last,
     v.published_at desc nulls last,
     c.id
   limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.search_courses(text, text, text, text, int, int, text, numeric, text, int, int)
  to anon, authenticated;
