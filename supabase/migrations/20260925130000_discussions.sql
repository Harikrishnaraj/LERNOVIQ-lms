-- T-083: per-course discussions (F-113). Threads and replies are plain text (rendered escaped).
-- Reads go through RPCs that also resolve author display names (profiles are otherwise private);
-- votes, reports and "mark answered" are RPCs so their rules live in one place.

create table public.discussions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 200),
  body text not null check (char_length(body) between 1 and 5000),
  answered_post_id uuid,
  pinned boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index discussions_course_idx on public.discussions (course_id, created_at desc);
create trigger discussions_updated_at before update on public.discussions
  for each row execute function public.set_updated_at();

create table public.discussion_posts (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.discussions (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index discussion_posts_thread_idx on public.discussion_posts (discussion_id, created_at);

alter table public.discussions
  add constraint discussions_answered_post_fk foreign key (answered_post_id)
  references public.discussion_posts (id) on delete set null;

create table public.discussion_votes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('thread', 'post')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create table public.discussion_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('thread', 'post')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  unique (reporter_id, target_type, target_id)
);

-- Who may see and write in a course discussion: enrolled learners, the owner and staff.
create function public.can_access_discussions(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from public.enrollments e
            where e.course_id = p_course_id and e.user_id = auth.uid() and e.status <> 'cancelled'
         )
      or exists (select 1 from public.courses c where c.id = p_course_id and c.instructor_id = auth.uid())
      or public.has_permission('course.read_all');
$$;
grant execute on function public.can_access_discussions(uuid) to authenticated;

create function public.can_moderate_discussions(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.courses c where c.id = p_course_id and c.instructor_id = auth.uid())
      or public.has_permission('course.review');
$$;
grant execute on function public.can_moderate_discussions(uuid) to authenticated;

alter table public.discussions enable row level security;
alter table public.discussion_posts enable row level security;
alter table public.discussion_votes enable row level security;
alter table public.discussion_reports enable row level security;

create policy "read discussions" on public.discussions for select to authenticated
  using (public.can_access_discussions(course_id) and (not hidden or public.can_moderate_discussions(course_id)));
create policy "start a discussion" on public.discussions for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_discussions(course_id) and not hidden and not pinned and answered_post_id is null);
create policy "delete own discussion" on public.discussions for delete to authenticated
  using (author_id = auth.uid());

create policy "read posts" on public.discussion_posts for select to authenticated
  using (
    exists (
      select 1 from public.discussions d
       where d.id = discussion_id
         and public.can_access_discussions(d.course_id)
         and (not d.hidden or public.can_moderate_discussions(d.course_id))
    )
    and (not hidden or exists (
      select 1 from public.discussions d where d.id = discussion_id and public.can_moderate_discussions(d.course_id)
    ))
  );
create policy "reply" on public.discussion_posts for insert to authenticated
  with check (
    author_id = auth.uid()
    and not hidden
    and exists (
      select 1 from public.discussions d
       where d.id = discussion_id and not d.hidden and public.can_access_discussions(d.course_id)
    )
  );
create policy "delete own post" on public.discussion_posts for delete to authenticated
  using (author_id = auth.uid());

create policy "read own votes" on public.discussion_votes for select to authenticated using (user_id = auth.uid());
create policy "read own reports" on public.discussion_reports for select to authenticated using (reporter_id = auth.uid());

revoke update on public.discussions from anon, authenticated;
revoke update on public.discussion_posts from anon, authenticated;
revoke insert, update, delete on public.discussion_votes from anon, authenticated;
revoke insert, update, delete on public.discussion_reports from anon, authenticated;

-- Thread list across the courses the caller can access (or one course).
create function public.list_discussions(p_course_id uuid default null)
returns table (
  id uuid, course_id uuid, course_slug text, course_title text, title text, body text,
  author_name text, created_at timestamptz, replies int, votes int, answered boolean, pinned boolean, mine boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.course_id, c.slug,
         coalesce((select v.title from public.course_versions v where v.id = c.published_version_id),
                  (select v.title from public.course_versions v where v.course_id = c.id order by v.version_number desc limit 1)),
         d.title, d.body,
         coalesce(nullif(trim(p.full_name), ''), 'A learner'),
         d.created_at,
         (select count(*)::int from public.discussion_posts x where x.discussion_id = d.id and not x.hidden),
         (select count(*)::int from public.discussion_votes vt where vt.target_type = 'thread' and vt.target_id = d.id),
         d.answered_post_id is not null,
         d.pinned,
         d.author_id = auth.uid()
    from public.discussions d
    join public.courses c on c.id = d.course_id
    left join public.profiles p on p.id = d.author_id
   where public.can_access_discussions(d.course_id)
     and (not d.hidden or public.can_moderate_discussions(d.course_id))
     and (p_course_id is null or d.course_id = p_course_id)
   order by d.pinned desc, d.created_at desc
   limit 200;
$$;
revoke all on function public.list_discussions(uuid) from public, anon;
grant execute on function public.list_discussions(uuid) to authenticated;

-- One thread with its replies, author names, vote counts and the caller's own votes.
create function public.get_discussion(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d public.discussions;
  c public.courses;
  v_mod boolean;
begin
  select * into d from public.discussions where id = p_id;
  if not found then return null; end if;
  if not public.can_access_discussions(d.course_id) then return null; end if;
  v_mod := public.can_moderate_discussions(d.course_id);
  if d.hidden and not v_mod then return null; end if;
  select * into c from public.courses where id = d.course_id;

  return jsonb_build_object(
    'id', d.id,
    'course_id', d.course_id,
    'course_slug', c.slug,
    'course_title', coalesce((select v.title from public.course_versions v where v.id = c.published_version_id),
                             (select v.title from public.course_versions v where v.course_id = c.id order by v.version_number desc limit 1)),
    'title', d.title,
    'body', d.body,
    'author_name', coalesce((select nullif(trim(p.full_name), '') from public.profiles p where p.id = d.author_id), 'A learner'),
    'created_at', d.created_at,
    'answered_post_id', d.answered_post_id,
    'pinned', d.pinned,
    'mine', d.author_id = auth.uid(),
    'can_moderate', v_mod,
    'votes', (select count(*)::int from public.discussion_votes vt where vt.target_type = 'thread' and vt.target_id = d.id),
    'voted', exists (select 1 from public.discussion_votes vt where vt.target_type = 'thread' and vt.target_id = d.id and vt.user_id = auth.uid()),
    'reported', exists (select 1 from public.discussion_reports r where r.target_type = 'thread' and r.target_id = d.id and r.reporter_id = auth.uid()),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id,
        'body', x.body,
        'author_name', coalesce(nullif(trim(p.full_name), ''), 'A learner'),
        'created_at', x.created_at,
        'mine', x.author_id = auth.uid(),
        'is_instructor', x.author_id = c.instructor_id,
        'votes', (select count(*)::int from public.discussion_votes vt where vt.target_type = 'post' and vt.target_id = x.id),
        'voted', exists (select 1 from public.discussion_votes vt where vt.target_type = 'post' and vt.target_id = x.id and vt.user_id = auth.uid()),
        'reported', exists (select 1 from public.discussion_reports r where r.target_type = 'post' and r.target_id = x.id and r.reporter_id = auth.uid())
      ) order by x.created_at)
      from public.discussion_posts x
      left join public.profiles p on p.id = x.author_id
     where x.discussion_id = d.id and (not x.hidden or v_mod)
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_discussion(uuid) from public, anon;
grant execute on function public.get_discussion(uuid) to authenticated;

-- Resolves a vote/report target to its course and checks the caller may see it.
create function public.discussion_target_course(p_type text, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case p_type
    when 'thread' then (select d.course_id from public.discussions d where d.id = p_id and not d.hidden)
    when 'post' then (select d.course_id from public.discussion_posts x join public.discussions d on d.id = x.discussion_id
                       where x.id = p_id and not x.hidden and not d.hidden)
  end;
$$;
revoke all on function public.discussion_target_course(text, uuid) from public, anon, authenticated;

-- Toggles the caller upvote; returns the new state and count. Your own content cannot be upvoted.
create function public.toggle_discussion_vote(p_type text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid := public.discussion_target_course(p_type, p_id);
  v_author uuid;
  v_now boolean;
begin
  if auth.uid() is null or v_course is null or not public.can_access_discussions(v_course) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select case p_type
           when 'thread' then (select author_id from public.discussions where id = p_id)
           else (select author_id from public.discussion_posts where id = p_id)
         end into v_author;
  if v_author = auth.uid() then
    raise exception 'you cannot upvote your own post' using errcode = '22023';
  end if;
  if exists (select 1 from public.discussion_votes where user_id = auth.uid() and target_type = p_type and target_id = p_id) then
    delete from public.discussion_votes where user_id = auth.uid() and target_type = p_type and target_id = p_id;
    v_now := false;
  else
    insert into public.discussion_votes (user_id, target_type, target_id) values (auth.uid(), p_type, p_id);
    v_now := true;
  end if;
  return jsonb_build_object(
    'voted', v_now,
    'votes', (select count(*)::int from public.discussion_votes where target_type = p_type and target_id = p_id)
  );
end;
$$;
revoke all on function public.toggle_discussion_vote(text, uuid) from public, anon;
grant execute on function public.toggle_discussion_vote(text, uuid) to authenticated;

-- Reports content once per reporter. The moderation queue reads these later.
create function public.report_discussion(p_type text, p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid := public.discussion_target_course(p_type, p_id);
begin
  if auth.uid() is null or v_course is null or not public.can_access_discussions(v_course) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.discussion_reports (reporter_id, target_type, target_id, reason)
  values (auth.uid(), p_type, p_id, trim(p_reason))
  on conflict (reporter_id, target_type, target_id) do nothing;
end;
$$;
revoke all on function public.report_discussion(text, uuid, text) from public, anon;
grant execute on function public.report_discussion(text, uuid, text) to authenticated;

-- Mark a reply as the answer (or clear it with null): the thread author, the course owner or a reviewer.
create function public.mark_discussion_answered(p_discussion_id uuid, p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.discussions;
begin
  select * into d from public.discussions where id = p_discussion_id;
  if not found or not public.can_access_discussions(d.course_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if d.author_id <> auth.uid() and not public.can_moderate_discussions(d.course_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_post_id is not null and not exists (
    select 1 from public.discussion_posts x where x.id = p_post_id and x.discussion_id = p_discussion_id and not x.hidden
  ) then
    raise exception 'that reply is not part of this discussion' using errcode = '22023';
  end if;
  update public.discussions set answered_post_id = p_post_id where id = p_discussion_id;
end;
$$;
revoke all on function public.mark_discussion_answered(uuid, uuid) from public, anon;
grant execute on function public.mark_discussion_answered(uuid, uuid) to authenticated;
