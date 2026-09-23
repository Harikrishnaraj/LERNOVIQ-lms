-- T-012: profiles, roles, permissions, role_permissions, user_roles + RLS.
-- Roles per SECURITY.md §3.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id text primary key,
  name text not null,
  description text
);

create table public.permissions (
  id text primary key,
  description text
);

create table public.role_permissions (
  role_id text not null references public.roles (id) on delete cascade,
  permission_id text not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id text not null references public.roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;

create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "read own roles" on public.user_roles
  for select using (auth.uid() = user_id);

create policy "authenticated read roles" on public.roles
  for select to authenticated using (true);

create policy "authenticated read permissions" on public.permissions
  for select to authenticated using (true);

create policy "authenticated read role_permissions" on public.role_permissions
  for select to authenticated using (true);

-- Auto-create a profile row for every new auth user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;

insert into public.roles (id, name) values
  ('learner', 'Learner'),
  ('instructor', 'Instructor'),
  ('content_reviewer', 'Content Reviewer'),
  ('org_admin', 'Org Admin'),
  ('support_agent', 'Support Agent'),
  ('admin', 'Admin'),
  ('super_admin', 'Super Admin');
