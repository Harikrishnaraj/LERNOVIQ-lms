-- T-109: Instructor reviews management (F-217): ratings list, distribution, reply to reviews.

-- 1. List instructor reviews scoped to courses owned by auth.uid().
create or replace function public.instructor_reviews(p_course_id uuid default null)
returns table (
  id uuid,
  course_id uuid,
  course_title text,
  course_slug text,
  user_id uuid,
  learner_name text,
  rating int,
  body text,
  hidden boolean,
  instructor_reply text,
  replied_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         r.course_id,
         coalesce((select v.title from public.course_versions v where v.id = c.published_version_id),
                  (select v.title from public.course_versions v where v.course_id = c.id order by v.version_number desc limit 1),
                  c.slug) as course_title,
         c.slug as course_slug,
         r.user_id,
         coalesce(nullif(trim(p.full_name), ''), 'A learner') as learner_name,
         r.rating,
         r.body,
         r.hidden,
         r.instructor_reply,
         r.replied_at,
         r.created_at,
         r.updated_at
    from public.course_ratings r
    join public.courses c on c.id = r.course_id
    left join public.profiles p on p.id = r.user_id
   where c.instructor_id = auth.uid()
     and (p_course_id is null or r.course_id = p_course_id)
   order by r.created_at desc;
$$;

revoke all on function public.instructor_reviews(uuid) from public, anon;
grant execute on function public.instructor_reviews(uuid) to authenticated;

-- 2. Instructor reviews summary & rating distribution (1 to 5 stars).
create or replace function public.instructor_review_summary(p_course_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total int;
  v_avg numeric;
  v_replied int;
  v_unreplied int;
  v_dist jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select count(*)::int,
         coalesce(round(avg(r.rating)::numeric, 1), 0),
         coalesce(count(*) filter (where r.instructor_reply is not null and trim(r.instructor_reply) <> '')::int, 0),
         coalesce(count(*) filter (where r.instructor_reply is null or trim(r.instructor_reply) = '')::int, 0)
    into v_total, v_avg, v_replied, v_unreplied
    from public.course_ratings r
    join public.courses c on c.id = r.course_id
   where c.instructor_id = auth.uid()
     and (p_course_id is null or r.course_id = p_course_id);

  select jsonb_object_agg(n::text, coalesce((
    select count(*)::int
      from public.course_ratings r
      join public.courses c on c.id = r.course_id
     where c.instructor_id = auth.uid()
       and (p_course_id is null or r.course_id = p_course_id)
       and r.rating = n
  ), 0))
    into v_dist
    from generate_series(1, 5) n;

  return jsonb_build_object(
    'total_reviews', v_total,
    'average_rating', v_avg,
    'replied_count', v_replied,
    'unreplied_count', v_unreplied,
    'distribution', v_dist
  );
end;
$$;

revoke all on function public.instructor_review_summary(uuid) from public, anon;
grant execute on function public.instructor_review_summary(uuid) to authenticated;

-- 3. Reply to review RPC.
create or replace function public.reply_to_course_review(p_rating_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id uuid;
  v_instructor_id uuid;
  v_trimmed text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select c.id, c.instructor_id
    into v_course_id, v_instructor_id
    from public.course_ratings r
    join public.courses c on c.id = r.course_id
   where r.id = p_rating_id;

  if not found then
    raise exception 'rating not found' using errcode = 'P0002';
  end if;

  if v_instructor_id <> auth.uid() and not public.has_permission('course.review') then
    raise exception 'not allowed to reply to this course review' using errcode = '42501';
  end if;

  v_trimmed := trim(coalesce(p_reply, ''));

  if v_trimmed = '' then
    update public.course_ratings
       set instructor_reply = null,
           replied_at = null
     where id = p_rating_id;
  else
    if char_length(v_trimmed) > 2000 then
      raise exception 'reply cannot exceed 2000 characters' using errcode = '22023';
    end if;

    update public.course_ratings
       set instructor_reply = v_trimmed,
           replied_at = now()
     where id = p_rating_id;
  end if;
end;
$$;

revoke all on function public.reply_to_course_review(uuid, text) from public, anon;
grant execute on function public.reply_to_course_review(uuid, text) to authenticated;

-- 4. Delete review reply RPC.
create or replace function public.delete_course_review_reply(p_rating_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reply_to_course_review(p_rating_id, null);
end;
$$;

revoke all on function public.delete_course_review_reply(uuid) from public, anon;
grant execute on function public.delete_course_review_reply(uuid) to authenticated;
