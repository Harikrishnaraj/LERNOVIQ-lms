-- T-105: instructor discussions (F-214): unanswered queue, reply, pin, moderate.
-- Only discussions in courses owned by auth.uid() are returned or modified.

create or replace function public.instructor_discussions(p_course_id uuid default null)
returns table (
  id uuid,
  course_id uuid,
  course_slug text,
  course_title text,
  title text,
  body text,
  author_name text,
  created_at timestamptz,
  replies int,
  votes int,
  answered boolean,
  pinned boolean,
  hidden boolean,
  open_reports int
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id,
         d.course_id,
         c.slug,
         coalesce((select v.title from public.course_versions v where v.id = c.published_version_id),
                  (select v.title from public.course_versions v where v.course_id = c.id order by v.version_number desc limit 1)),
         d.title,
         d.body,
         coalesce(nullif(trim(p.full_name), ''), 'A learner'),
         d.created_at,
         (select count(*)::int from public.discussion_posts x where x.discussion_id = d.id and not x.hidden),
         (select count(*)::int from public.discussion_votes vt where vt.target_type = 'thread' and vt.target_id = d.id),
         d.answered_post_id is not null,
         d.pinned,
         d.hidden,
         (
           select count(*)::int
             from public.discussion_reports r
            where r.status = 'open'
              and (
                (r.target_type = 'thread' and r.target_id = d.id)
                or (r.target_type = 'post' and r.target_id in (select x.id from public.discussion_posts x where x.discussion_id = d.id))
              )
         )
    from public.discussions d
    join public.courses c on c.id = d.course_id
    left join public.profiles p on p.id = d.author_id
   where c.instructor_id = auth.uid()
     and (p_course_id is null or d.course_id = p_course_id)
   order by d.pinned desc, d.created_at desc
   limit 200;
$$;
revoke all on function public.instructor_discussions(uuid) from public, anon;
grant execute on function public.instructor_discussions(uuid) to authenticated;

-- Pin / unpin a thread. Only course instructors / moderators may pin.
create or replace function public.toggle_discussion_pinned(p_discussion_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid;
  v_pinned boolean;
begin
  select course_id, pinned into v_course, v_pinned from public.discussions where id = p_discussion_id;
  if not found or not public.can_moderate_discussions(v_course) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.discussions set pinned = not v_pinned where id = p_discussion_id returning pinned into v_pinned;
  return v_pinned;
end;
$$;
revoke all on function public.toggle_discussion_pinned(uuid) from public, anon;
grant execute on function public.toggle_discussion_pinned(uuid) to authenticated;

-- Moderate (hide / unhide) a discussion thread or reply post.
create or replace function public.set_discussion_hidden(p_type text, p_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid;
begin
  if p_type = 'thread' then
    select course_id into v_course from public.discussions where id = p_id;
    if not found or not public.can_moderate_discussions(v_course) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    update public.discussions set hidden = p_hidden where id = p_id;
  elsif p_type = 'post' then
    select d.course_id into v_course
      from public.discussion_posts x
      join public.discussions d on d.id = x.discussion_id
     where x.id = p_id;
    if not found or not public.can_moderate_discussions(v_course) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    update public.discussion_posts set hidden = p_hidden where id = p_id;
  else
    raise exception 'invalid target type' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.set_discussion_hidden(text, uuid, boolean) from public, anon;
grant execute on function public.set_discussion_hidden(text, uuid, boolean) to authenticated;

-- Resolve reports for a target thread or post.
create or replace function public.resolve_discussion_reports(p_type text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid;
begin
  if p_type = 'thread' then
    select course_id into v_course from public.discussions where id = p_id;
  elsif p_type = 'post' then
    select d.course_id into v_course
      from public.discussion_posts x
      join public.discussions d on d.id = x.discussion_id
     where x.id = p_id;
  else
    raise exception 'invalid target type' using errcode = '22023';
  end if;

  if v_course is null or not public.can_moderate_discussions(v_course) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.discussion_reports
     set status = 'resolved',
         resolved_at = now(),
         resolved_by = auth.uid()
   where target_type = p_type
     and target_id = p_id
     and status = 'open';
end;
$$;
revoke all on function public.resolve_discussion_reports(text, uuid) from public, anon;
grant execute on function public.resolve_discussion_reports(text, uuid) to authenticated;

-- Moderation queue: open reports in the caller's courses.
create or replace function public.instructor_discussion_reports(p_course_id uuid default null)
returns table (
  report_id uuid,
  target_type text,
  target_id uuid,
  discussion_id uuid,
  course_id uuid,
  course_title text,
  reason text,
  target_author_name text,
  target_preview text,
  target_hidden boolean,
  reported_at timestamptz,
  reporter_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id as report_id,
         r.target_type,
         r.target_id,
         case r.target_type
           when 'thread' then d.id
           when 'post' then p_post.discussion_id
         end as discussion_id,
         c.id as course_id,
         coalesce((select v.title from public.course_versions v where v.id = c.published_version_id),
                  (select v.title from public.course_versions v where v.course_id = c.id order by v.version_number desc limit 1)) as course_title,
         r.reason,
         case r.target_type
           when 'thread' then coalesce(nullif(trim(p_author.full_name), ''), 'A learner')
           when 'post' then coalesce(nullif(trim(p_post_author.full_name), ''), 'A learner')
         end as target_author_name,
         case r.target_type
           when 'thread' then substring(d.title || ' — ' || d.body from 1 for 150)
           when 'post' then substring(p_post.body from 1 for 150)
         end as target_preview,
         case r.target_type
           when 'thread' then d.hidden
           when 'post' then p_post.hidden
         end as target_hidden,
         r.created_at as reported_at,
         coalesce(nullif(trim(p_reporter.full_name), ''), 'A learner') as reporter_name
    from public.discussion_reports r
    left join public.discussions d on r.target_type = 'thread' and d.id = r.target_id
    left join public.discussion_posts p_post on r.target_type = 'post' and p_post.id = r.target_id
    left join public.discussions d_parent on r.target_type = 'post' and d_parent.id = p_post.discussion_id
    join public.courses c on c.id = coalesce(d.course_id, d_parent.course_id)
    left join public.profiles p_author on d.author_id = p_author.id
    left join public.profiles p_post_author on p_post.author_id = p_post_author.id
    left join public.profiles p_reporter on r.reporter_id = p_reporter.id
   where c.instructor_id = auth.uid()
     and r.status = 'open'
     and (p_course_id is null or c.id = p_course_id)
   order by r.created_at desc
   limit 100;
$$;
revoke all on function public.instructor_discussion_reports(uuid) from public, anon;
grant execute on function public.instructor_discussion_reports(uuid) to authenticated;

-- Allow instructors and reviewers to read discussion reports for their courses.
drop policy if exists "moderators read reports for own courses" on public.discussion_reports;
create policy "moderators read reports for own courses" on public.discussion_reports for select to authenticated
using (
  (target_type = 'thread' and exists (
    select 1 from public.discussions d
     where d.id = target_id and public.can_moderate_discussions(d.course_id)
  ))
  or
  (target_type = 'post' and exists (
    select 1 from public.discussion_posts p
     join public.discussions d on d.id = p.discussion_id
    where p.id = target_id and public.can_moderate_discussions(d.course_id)
  ))
);
