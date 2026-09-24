-- T-058: submitting a course version for review (F-210).
-- A submission row is the review history entry (who, when, notes to the reviewer). The status flip
-- and the row are written together by submit_course_version, which only the service role can run:
-- the server action checks ownership and readiness first.

create table public.course_submissions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.course_versions (id) on delete cascade,
  submitted_by uuid not null references public.profiles (id) on delete cascade,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create index course_submissions_version_idx on public.course_submissions (version_id, created_at desc);

alter table public.course_submissions enable row level security;

-- Readable by the owning instructor and by reviewers; never writable through the API.
create policy "read submissions" on public.course_submissions for select to authenticated
  using (
    public.has_permission('course.review')
    or public.has_permission('course.read_all')
    or exists (
      select 1 from public.course_versions v
       where v.id = version_id and public.owns_course(v.course_id)
    )
  );

create function public.submit_course_version(p_version_id uuid, p_user_id uuid, p_notes text)
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
     set status = 'submitted'
   where id = p_version_id and status in ('draft', 'changes_requested');
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return false; end if;

  insert into public.course_submissions (version_id, submitted_by, notes)
  values (p_version_id, p_user_id, coalesce(p_notes, ''));
  return true;
end;
$$;

revoke all on function public.submit_course_version(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.submit_course_version(uuid, uuid, text) to service_role;
