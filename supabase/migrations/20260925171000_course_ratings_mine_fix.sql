-- T-087 fix: for a signed-out reader auth.uid() is null, so "mine" must be false, not null.
create or replace function public.get_course_reviews(p_slug text, p_limit int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.courses;
begin
  select * into c from public.courses where slug = p_slug and published_version_id is not null;
  if not found then return null; end if;
  return jsonb_build_object(
    'course_id', c.id,
    'avg', c.rating_avg,
    'count', c.rating_count,
    'distribution', (
      select jsonb_object_agg(n::text, coalesce((select count(*) from public.course_ratings r where r.course_id = c.id and not r.hidden and r.rating = n), 0))
        from generate_series(1, 5) n
    ),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'rating', r.rating,
        'body', r.body,
        'author_name', coalesce(nullif(trim(p.full_name), ''), 'A learner'),
        'created_at', r.created_at,
        'mine', coalesce(r.user_id = auth.uid(), false),
        'instructor_reply', r.instructor_reply,
        'replied_at', r.replied_at
      ) order by coalesce(r.user_id = auth.uid(), false) desc, r.created_at desc)
      from (select * from public.course_ratings x where x.course_id = c.id and not x.hidden order by x.created_at desc limit greatest(1, least(coalesce(p_limit, 20), 100))) r
      left join public.profiles p on p.id = r.user_id
    ), '[]'::jsonb),
    'can_review', auth.uid() is not null and public.has_completed_course(c.id),
    'mine', (
      select jsonb_build_object('rating', r.rating, 'body', r.body)
        from public.course_ratings r where r.course_id = c.id and r.user_id = auth.uid()
    )
  );
end;
$$;
