-- T-087: ratings and written reviews of courses (F-117). One per learner per course, only after
-- completing it. (course_reviews already means reviewer decisions, hence course_ratings.)
-- courses.rating_avg / rating_count, which the catalog already shows, are kept in step by a trigger.

create table public.course_ratings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 2000),
  hidden boolean not null default false,           -- set by moderation (T-139)
  instructor_reply text check (instructor_reply is null or char_length(instructor_reply) <= 2000),
  replied_at timestamptz,                           -- written by the instructor reply feature (T-109)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, user_id)
);
create index course_ratings_course_idx on public.course_ratings (course_id, created_at desc);
create trigger course_ratings_updated_at before update on public.course_ratings
  for each row execute function public.set_updated_at();

create function public.has_completed_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
     where e.course_id = p_course_id and e.user_id = auth.uid() and e.status = 'completed'
  );
$$;
grant execute on function public.has_completed_course(uuid) to authenticated;

alter table public.course_ratings enable row level security;

create policy "read visible ratings" on public.course_ratings for select
  using (
    (not hidden and exists (select 1 from public.courses c where c.id = course_id and c.published_version_id is not null))
    or user_id = auth.uid()
    or exists (select 1 from public.courses c where c.id = course_id and c.instructor_id = auth.uid())
    or public.has_permission('course.read_all')
  );
create policy "rate a completed course" on public.course_ratings for insert to authenticated
  with check (user_id = auth.uid() and public.has_completed_course(course_id) and not hidden
              and instructor_reply is null and replied_at is null);
create policy "edit own rating" on public.course_ratings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own rating" on public.course_ratings for delete to authenticated
  using (user_id = auth.uid());

-- Learners may only write the rating and the text.
revoke update on public.course_ratings from anon, authenticated;
grant update (rating, body) on public.course_ratings to authenticated;

-- Keep courses.rating_avg / rating_count in step (hidden ratings do not count).
create function public.refresh_course_rating(p_course_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.courses c
     set rating_avg = coalesce((select round(avg(r.rating)::numeric, 2) from public.course_ratings r where r.course_id = p_course_id and not r.hidden), 0),
         rating_count = (select count(*) from public.course_ratings r where r.course_id = p_course_id and not r.hidden)
   where c.id = p_course_id;
$$;
revoke all on function public.refresh_course_rating(uuid) from public, anon, authenticated;

create function public.course_ratings_refresh_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_course_rating(coalesce(new.course_id, old.course_id));
  return null;
end;
$$;
revoke all on function public.course_ratings_refresh_trigger() from public, anon, authenticated;
create trigger course_ratings_refresh after insert or update or delete on public.course_ratings
  for each row execute function public.course_ratings_refresh_trigger();

-- Public reviews of a course: summary, distribution, the newest reviews, and the caller's own.
create function public.get_course_reviews(p_slug text, p_limit int default 20)
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
        'mine', r.user_id = auth.uid(),
        'instructor_reply', r.instructor_reply,
        'replied_at', r.replied_at
      ) order by (r.user_id = auth.uid()) desc, r.created_at desc)
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
revoke all on function public.get_course_reviews(text, int) from public;
grant execute on function public.get_course_reviews(text, int) to anon, authenticated;
