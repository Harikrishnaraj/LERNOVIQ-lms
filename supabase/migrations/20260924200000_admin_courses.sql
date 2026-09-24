-- T-072: admin course list + the atomic course transition (F-405, F-406).

-- Review history: one row per decision on a version. Readable by reviewers and the course owner;
-- written only by apply_course_transition (service role).
create table public.course_reviews (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.course_versions (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('start_review', 'request_changes', 'approve', 'reject', 'publish', 'archive', 'reopen')),
  from_status text not null,
  to_status text not null,
  note text not null default '' check (char_length(note) <= 4000),
  created_at timestamptz not null default now()
);
create index course_reviews_version_idx on public.course_reviews (version_id, created_at desc);

alter table public.course_reviews enable row level security;
create policy "read reviews" on public.course_reviews for select to authenticated
  using (
    public.has_permission('course.review')
    or public.has_permission('course.read_all')
    or exists (
      select 1 from public.course_versions v
       where v.id = version_id and public.owns_course(v.course_id)
    )
  );

-- submit_course_version now also stamps submitted_at.
create or replace function public.submit_course_version(p_version_id uuid, p_user_id uuid, p_notes text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid;
  v_rows int;
begin
  select course_id into v_course from public.course_versions where id = p_version_id;
  if v_course is null then return false; end if;
  if not exists (select 1 from public.courses where id = v_course and instructor_id = p_user_id) then
    return false;
  end if;

  update public.course_versions
     set status = 'submitted', submitted_at = now()
   where id = p_version_id and status in ('draft', 'changes_requested');
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return false; end if;

  insert into public.course_submissions (version_id, submitted_by, notes)
  values (p_version_id, p_user_id, coalesce(p_notes, ''));
  return true;
end;
$$;

-- The one place a reviewer decision changes a version. The caller (server action) has already
-- checked permission and the state machine; the WHERE on p_from makes it safe against two
-- reviewers acting at once. Publishing points the course at this version and archives the
-- previously live one; archiving takes the course off the catalog (enrolled learners keep their
-- pinned version through their enrollment).
create function public.apply_course_transition(
  p_version_id uuid, p_from text, p_to text, p_actor uuid, p_action text, p_note text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid;
  v_rows int;
begin
  select course_id into v_course from public.course_versions where id = p_version_id;
  if v_course is null then return false; end if;

  update public.course_versions
     set status = p_to,
         published_at = case when p_to = 'published' then now() else published_at end
   where id = p_version_id and status = p_from;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return false; end if;

  if p_to = 'published' then
    update public.course_versions set status = 'archived'
     where course_id = v_course and id <> p_version_id and status = 'published';
    update public.courses set published_version_id = p_version_id where id = v_course;
  elsif p_to = 'archived' then
    update public.courses set published_version_id = null
     where id = v_course and published_version_id = p_version_id;
  end if;

  insert into public.course_reviews (version_id, actor_id, action, from_status, to_status, note)
  values (p_version_id, p_actor, p_action, p_from, p_to, coalesce(p_note, ''));
  return true;
end;
$$;

revoke all on function public.apply_course_transition(uuid, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.apply_course_transition(uuid, text, text, uuid, text, text) to service_role;

-- Every course with its newest version, for the admin Courses screen.
create function public.admin_courses()
returns table (
  course_id uuid,
  version_id uuid,
  slug text,
  title text,
  status text,
  version_number int,
  instructor_id uuid,
  instructor_name text,
  instructor_email text,
  category_slug text,
  category_name text,
  price_cents int,
  currency text,
  learners int,
  is_live boolean,
  submitted_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('course.read_all') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select c.id, v.id, c.slug, v.title, v.status, v.version_number,
         c.instructor_id, p.full_name, u.email::text,
         cat.slug, cat.name, v.price_cents, v.currency,
         (select count(*)::int from public.enrollments e where e.course_id = c.id and e.status <> 'cancelled'),
         c.published_version_id is not null,
         v.submitted_at,
         greatest(c.updated_at, v.updated_at)
    from public.courses c
    join lateral (
      select * from public.course_versions v2
       where v2.course_id = c.id
       order by v2.version_number desc
       limit 1
    ) v on true
    left join public.categories cat on cat.id = c.category_id
    left join public.profiles p on p.id = c.instructor_id
    left join auth.users u on u.id = c.instructor_id
   order by greatest(c.updated_at, v.updated_at) desc;
end;
$$;
revoke all on function public.admin_courses() from public, anon;
grant execute on function public.admin_courses() to authenticated;
