-- T-106: direct 1:1 messaging between instructors and learners (F-215).
-- Scoped to course enrollments: instructors message learners in their own courses.

create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  instructor_id uuid not null references public.profiles (id) on delete cascade,
  learner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_threads_unique unique (course_id, instructor_id, learner_id)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists direct_messages_thread_idx on public.direct_messages (thread_id, created_at asc);
create index if not exists direct_messages_unread_idx on public.direct_messages (thread_id, sender_id, read_at) where read_at is null;

-- Trigger to update message_threads.updated_at when a direct message is added
create or replace function public.touch_message_thread()
returns trigger language plpgsql as $$
begin
  update public.message_threads set updated_at = new.created_at where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists direct_messages_touch_thread on public.direct_messages;
create trigger direct_messages_touch_thread
  after insert on public.direct_messages
  for each row execute function public.touch_message_thread();

-- Security & RLS
alter table public.message_threads enable row level security;
alter table public.direct_messages enable row level security;

create policy "read own message threads" on public.message_threads for select to authenticated
  using (instructor_id = auth.uid() or learner_id = auth.uid());

create policy "insert own message threads" on public.message_threads for insert to authenticated
  with check (instructor_id = auth.uid() or learner_id = auth.uid());

create policy "read thread messages" on public.direct_messages for select to authenticated
  using (
    exists (
      select 1 from public.message_threads t
       where t.id = thread_id and (t.instructor_id = auth.uid() or t.learner_id = auth.uid())
    )
  );

create policy "send direct message" on public.direct_messages for insert to authenticated
  with check (
    sender_id = auth.uid() and
    exists (
      select 1 from public.message_threads t
       where t.id = thread_id and (t.instructor_id = auth.uid() or t.learner_id = auth.uid())
    )
  );

create policy "mark messages read" on public.direct_messages for update to authenticated
  using (
    exists (
      select 1 from public.message_threads t
       where t.id = thread_id and (t.instructor_id = auth.uid() or t.learner_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.message_threads t
       where t.id = thread_id and (t.instructor_id = auth.uid() or t.learner_id = auth.uid())
    )
  );

-- RPC: Get or create 1:1 thread between instructor and learner for a course
create or replace function public.get_or_create_thread(p_course_id uuid, p_learner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instructor_id uuid;
  v_thread_id uuid;
begin
  select instructor_id into v_instructor_id from public.courses where id = p_course_id;
  if not found then
    raise exception 'course not found' using errcode = 'P0002';
  end if;

  -- Caller must either be the course instructor or the enrolled learner
  if auth.uid() = v_instructor_id then
    if not exists (select 1 from public.enrollments where course_id = p_course_id and user_id = p_learner_id and status <> 'cancelled') then
      raise exception 'learner is not enrolled in this course' using errcode = '42501';
    end if;
  elsif auth.uid() = p_learner_id then
    if not exists (select 1 from public.enrollments where course_id = p_course_id and user_id = p_learner_id and status <> 'cancelled') then
      raise exception 'you are not enrolled in this course' using errcode = '42501';
    end if;
  else
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select id into v_thread_id
    from public.message_threads
   where course_id = p_course_id
     and instructor_id = v_instructor_id
     and learner_id = p_learner_id;

  if not found then
    insert into public.message_threads (course_id, instructor_id, learner_id)
    values (p_course_id, v_instructor_id, p_learner_id)
    returning id into v_thread_id;
  end if;

  return v_thread_id;
end;
$$;
revoke all on function public.get_or_create_thread(uuid, uuid) from public, anon;
grant execute on function public.get_or_create_thread(uuid, uuid) to authenticated;

-- RPC: List threads for instructor with learner name, course title, last message and unread count
create or replace function public.list_instructor_threads()
returns table (
  thread_id uuid,
  course_id uuid,
  course_title text,
  learner_id uuid,
  learner_name text,
  last_message text,
  last_message_at timestamptz,
  unread_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id as thread_id,
         t.course_id,
         coalesce((select v.title from public.course_versions v where v.id = c.published_version_id),
                  (select v.title from public.course_versions v where v.course_id = c.id order by v.version_number desc limit 1)) as course_title,
         t.learner_id,
         coalesce(nullif(trim(p.full_name), ''), 'A learner') as learner_name,
         (select m.body from public.direct_messages m where m.thread_id = t.id order by m.created_at desc limit 1) as last_message,
         (select m.created_at from public.direct_messages m where m.thread_id = t.id order by m.created_at desc limit 1) as last_message_at,
         (select count(*)::int from public.direct_messages m where m.thread_id = t.id and m.sender_id <> auth.uid() and m.read_at is null) as unread_count
    from public.message_threads t
    join public.courses c on c.id = t.course_id
    left join public.profiles p on p.id = t.learner_id
   where t.instructor_id = auth.uid()
   order by (select m.created_at from public.direct_messages m where m.thread_id = t.id order by m.created_at desc limit 1) desc nulls last,
            t.updated_at desc;
$$;
revoke all on function public.list_instructor_threads() from public, anon;
grant execute on function public.list_instructor_threads() to authenticated;

-- RPC: Get thread messages
create or replace function public.get_thread_messages(p_thread_id uuid)
returns table (
  message_id uuid,
  sender_id uuid,
  sender_name text,
  body text,
  read_at timestamptz,
  created_at timestamptz,
  is_mine boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id as message_id,
         m.sender_id,
         coalesce(nullif(trim(p.full_name), ''), 'User') as sender_name,
         m.body,
         m.read_at,
         m.created_at,
         m.sender_id = auth.uid() as is_mine
    from public.direct_messages m
    join public.message_threads t on t.id = m.thread_id
    left join public.profiles p on p.id = m.sender_id
   where m.thread_id = p_thread_id
     and (t.instructor_id = auth.uid() or t.learner_id = auth.uid())
   order by m.created_at asc;
$$;
revoke all on function public.get_thread_messages(uuid) from public, anon;
grant execute on function public.get_thread_messages(uuid) to authenticated;

-- RPC: Mark all incoming messages in a thread as read
create or replace function public.mark_thread_read(p_thread_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if not exists (
    select 1 from public.message_threads t
     where t.id = p_thread_id and (t.instructor_id = auth.uid() or t.learner_id = auth.uid())
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.direct_messages
     set read_at = now()
   where thread_id = p_thread_id
     and sender_id <> auth.uid()
     and read_at is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;
revoke all on function public.mark_thread_read(uuid) from public, anon;
grant execute on function public.mark_thread_read(uuid) to authenticated;
