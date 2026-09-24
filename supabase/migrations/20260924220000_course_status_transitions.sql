-- T-074 / F-310: the course state machine, also enforced in the database. The table mirrors
-- src/features/courses/course-status.ts (a test keeps them identical); apply_course_transition
-- refuses any (from, action, to) that is not listed, whatever the caller passes.

create table public.course_status_transitions (
  from_status text not null,
  action text not null,
  to_status text not null,
  primary key (from_status, action)
);

insert into public.course_status_transitions (from_status, action, to_status) values
  ('draft', 'submit', 'submitted'),
  ('submitted', 'start_review', 'in_review'),
  ('in_review', 'request_changes', 'changes_requested'),
  ('in_review', 'approve', 'approved'),
  ('in_review', 'reject', 'rejected'),
  ('changes_requested', 'submit', 'submitted'),
  ('approved', 'publish', 'published'),
  ('published', 'archive', 'archived'),
  ('rejected', 'reopen', 'draft');

alter table public.course_status_transitions enable row level security;
create policy "read transitions" on public.course_status_transitions for select to authenticated using (true);
revoke insert, update, delete, truncate on public.course_status_transitions from anon, authenticated;

create or replace function public.apply_course_transition(
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
  if not exists (
    select 1 from public.course_status_transitions
     where from_status = p_from and action = p_action and to_status = p_to
  ) then
    return false;
  end if;

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
