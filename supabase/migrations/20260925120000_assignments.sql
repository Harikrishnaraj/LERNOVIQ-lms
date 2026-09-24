-- T-081: assignments and learner submissions (F-108).
-- Learners never write submissions through the API: submit_assignment (service role only) checks
-- enrollment in the exact version, the deadline and the grading lock, then upserts. Files live in a
-- private bucket reached only by server-issued signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('assignment-submissions', 'assignment-submissions', false, 10485760, array[
    'application/pdf', 'application/zip', 'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png', 'image/jpeg'
  ])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.course_versions (id) on delete cascade,
  lesson_id uuid unique references public.lessons (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  instructions text not null default '' check (char_length(instructions) <= 20000),
  due_at timestamptz,
  max_points int not null default 100 check (max_points between 1 and 1000),
  allow_late boolean not null default false,
  allow_text boolean not null default true,
  allow_file boolean not null default true,
  max_file_mb int not null default 10 check (max_file_mb between 1 and 10),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (allow_text or allow_file)
);
create index assignments_version_idx on public.assignments (version_id, position);
create trigger assignments_updated_at before update on public.assignments
  for each row execute function public.set_updated_at();

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  text_answer text not null default '' check (char_length(text_answer) <= 20000),
  file_path text,
  file_name text,
  file_size int,
  file_type text,
  status text not null default 'submitted' check (status in ('submitted', 'graded')),
  is_late boolean not null default false,
  submitted_at timestamptz not null default now(),
  grade int check (grade is null or grade >= 0),
  feedback text not null default '' check (char_length(feedback) <= 10000),
  graded_by uuid references public.profiles (id) on delete set null,
  graded_at timestamptz,
  unique (assignment_id, user_id)
);
create index assignment_submissions_user_idx on public.assignment_submissions (user_id);

alter table public.assignments enable row level security;
alter table public.assignment_submissions enable row level security;

create policy "read assignments" on public.assignments for select to authenticated
  using (public.can_access_assessment_version(version_id));
create policy "edit assignments" on public.assignments for all to authenticated
  using (public.can_edit_version(version_id)) with check (public.can_edit_version(version_id));

create policy "read submissions" on public.assignment_submissions for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_permission('course.read_all')
    or exists (
      select 1 from public.assignments a
        join public.course_versions v on v.id = a.version_id
       where a.id = assignment_id and public.owns_course(v.course_id)
    )
  );

revoke insert, update, delete on public.assignment_submissions from anon, authenticated;

create function public.submit_assignment(
  p_assignment_id uuid,
  p_user_id uuid,
  p_text text,
  p_file_path text,
  p_file_name text,
  p_file_size int,
  p_file_type text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.assignments;
  existing public.assignment_submissions;
  v_late boolean := false;
  v_text text := coalesce(trim(p_text), '');
begin
  select * into a from public.assignments where id = p_assignment_id;
  if not found then return jsonb_build_object('result', 'not_found'); end if;

  if not exists (
    select 1 from public.enrollments e
     where e.user_id = p_user_id and e.version_id = a.version_id and e.status <> 'cancelled'
  ) then
    return jsonb_build_object('result', 'not_enrolled');
  end if;

  if a.due_at is not null and now() > a.due_at then
    if not a.allow_late then return jsonb_build_object('result', 'closed'); end if;
    v_late := true;
  end if;

  select * into existing from public.assignment_submissions
   where assignment_id = p_assignment_id and user_id = p_user_id;
  if found and existing.status = 'graded' then return jsonb_build_object('result', 'graded'); end if;

  if v_text = '' and p_file_path is null then return jsonb_build_object('result', 'empty'); end if;
  if v_text <> '' and not a.allow_text then return jsonb_build_object('result', 'text_not_allowed'); end if;
  if p_file_path is not null and not a.allow_file then return jsonb_build_object('result', 'file_not_allowed'); end if;
  if p_file_path is not null and p_file_size > a.max_file_mb * 1024 * 1024 then
    return jsonb_build_object('result', 'file_too_large');
  end if;

  insert into public.assignment_submissions
    (assignment_id, user_id, text_answer, file_path, file_name, file_size, file_type, is_late, submitted_at)
  values
    (p_assignment_id, p_user_id, v_text, p_file_path, p_file_name, p_file_size, p_file_type, v_late, now())
  on conflict (assignment_id, user_id) do update
    set text_answer = excluded.text_answer,
        file_path = excluded.file_path,
        file_name = excluded.file_name,
        file_size = excluded.file_size,
        file_type = excluded.file_type,
        is_late = excluded.is_late,
        submitted_at = excluded.submitted_at;

  return jsonb_build_object('result', 'ok', 'previous_file_path', existing.file_path);
end;
$$;
revoke all on function public.submit_assignment(uuid, uuid, text, text, text, int, text) from public, anon, authenticated;
grant execute on function public.submit_assignment(uuid, uuid, text, text, text, int, text) to service_role;
