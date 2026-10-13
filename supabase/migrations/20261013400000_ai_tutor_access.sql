-- T-206 (F-701, F-704, ADR-043): the learner AI Tutor needs per-user admin approval.
--
-- A row means the user may use the tutor; no row means they may not (the default). Admins with
-- ai.manage_access switch it on or off through a server action that writes with the service role
-- and records an audit entry, so clients get read access at most.

insert into public.permissions (id, description) values
  ('ai.manage_access', 'Turn the learner AI Tutor on or off for individual users');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'ai.manage_access'),
  ('super_admin', 'ai.manage_access');

create table public.ai_tutor_access (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 500)
);

alter table public.ai_tutor_access enable row level security;

create policy "users read own ai tutor access" on public.ai_tutor_access for select to authenticated
  using (user_id = auth.uid() or public.has_permission('ai.manage_access') or public.has_permission('user.read_all'));

revoke all on public.ai_tutor_access from anon, authenticated;
grant select on public.ai_tutor_access to authenticated;

-- The tutor's server-side gate. Bound to auth.uid(): it only ever answers for the caller.
create function public.has_ai_tutor_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.ai_tutor_access a where a.user_id = auth.uid());
$$;
revoke all on function public.has_ai_tutor_access() from public, anon;
grant execute on function public.has_ai_tutor_access() to authenticated;
