-- T-170 (F-520, ADR-038): content server schema. A content client (a customer running its own
-- LMS) holds licences; a licence names the courses it covers, a seat limit, an expiry date, the
-- LMS origins allowed to embed the content, and a revoke switch. A dispatch is one licensed
-- course packaged for that client's LMS; its public_id goes into the dispatch zip (T-172) and is
-- signed by the app, never trusted on its own. A registration is one LMS learner on one dispatch,
-- stored only as a keyed hash of the LMS learner ID (SECURITY §27: no learner PII).
--
-- Only `content_server.manage` (admin, super_admin) can read or change any of this. Launches
-- (T-173) write registrations through a service-role path, so authenticated users get read access
-- to registrations at most, never write.

insert into public.permissions (id, description) values
  ('content_server.manage', 'Manage content-server clients, licences and dispatches (ADR-038)');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'content_server.manage'),
  ('super_admin', 'content_server.manage');

-- An embedding origin is scheme + host (+ port), lowercase, no path: what a browser sends as
-- Origin and what frame-ancestors matches against.
create function public.is_valid_web_origin(p_origin text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_origin ~ '^https?://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$'
    and char_length(p_origin) <= 253;
$$;

create function public.are_valid_web_origins(p_origins text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(bool_and(public.is_valid_web_origin(o)), true) from unnest(p_origins) o;
$$;

create table public.content_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 200),
  contact_email text check (contact_email is null or (char_length(contact_email) <= 320 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_licences (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.content_clients (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  -- null = unlimited seats
  seat_limit int check (seat_limit is null or seat_limit between 1 and 1000000),
  -- null = no expiry
  expires_at timestamptz,
  allowed_origins text[] not null default '{}' check (
    public.are_valid_web_origins(allowed_origins) and cardinality(allowed_origins) <= 50
  ),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- revoked_by may be null on a revoked licence once that admin's account is deleted
  check (revoked_by is null or revoked_at is not null)
);
create index content_licences_client_idx on public.content_licences (client_id);

create table public.content_licence_courses (
  licence_id uuid not null references public.content_licences (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (licence_id, course_id)
);
create index content_licence_courses_course_idx on public.content_licence_courses (course_id);

-- A dispatch exists only for a course the licence covers (composite FK); removing the course from
-- the licence removes its dispatch, so an old zip stops resolving.
create table public.content_dispatches (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default replace(gen_random_uuid()::text, '-', '')
    check (public_id ~ '^[0-9a-f]{32}$'),
  licence_id uuid not null,
  course_id uuid not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (licence_id, course_id),
  foreign key (licence_id, course_id)
    references public.content_licence_courses (licence_id, course_id) on delete cascade
);

-- licence_id is copied from the dispatch by trigger (never supplied by the caller) so seats can be
-- counted per licence: one LMS learner counts once per licence, however many courses they open.
create table public.content_registrations (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.content_dispatches (id) on delete cascade,
  licence_id uuid not null references public.content_licences (id) on delete cascade,
  learner_key text not null check (learner_key ~ '^[0-9a-f]{64}$'),
  first_launch_at timestamptz not null default now(),
  last_launch_at timestamptz not null default now(),
  launch_count int not null default 1 check (launch_count >= 1),
  unique (dispatch_id, learner_key)
);
create index content_registrations_licence_learner_idx on public.content_registrations (licence_id, learner_key);

create function public.set_content_registration_licence()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select licence_id into strict new.licence_id from public.content_dispatches where id = new.dispatch_id;
  return new;
end;
$$;
create trigger content_registrations_set_licence before insert or update of dispatch_id
  on public.content_registrations
  for each row execute function public.set_content_registration_licence();

create trigger content_clients_updated_at before update on public.content_clients
  for each row execute function public.set_updated_at();
create trigger content_licences_updated_at before update on public.content_licences
  for each row execute function public.set_updated_at();

-- Seats in use on a licence: distinct LMS learners across all of its dispatches.
create function public.content_licence_seats_used(p_licence_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when public.has_permission('content_server.manage') or auth.role() = 'service_role'
    then (select count(distinct learner_key)::int from public.content_registrations where licence_id = p_licence_id)
    else null end;
$$;
revoke all on function public.content_licence_seats_used(uuid) from public, anon;
grant execute on function public.content_licence_seats_used(uuid) to authenticated, service_role;

alter table public.content_clients enable row level security;
alter table public.content_licences enable row level security;
alter table public.content_licence_courses enable row level security;
alter table public.content_dispatches enable row level security;
alter table public.content_registrations enable row level security;

create policy "content managers manage clients" on public.content_clients for all to authenticated
  using (public.has_permission('content_server.manage'))
  with check (public.has_permission('content_server.manage'));
create policy "content managers manage licences" on public.content_licences for all to authenticated
  using (public.has_permission('content_server.manage'))
  with check (public.has_permission('content_server.manage'));
create policy "content managers manage licence courses" on public.content_licence_courses for all to authenticated
  using (public.has_permission('content_server.manage'))
  with check (public.has_permission('content_server.manage'));
create policy "content managers manage dispatches" on public.content_dispatches for all to authenticated
  using (public.has_permission('content_server.manage'))
  with check (public.has_permission('content_server.manage'));
-- Registrations are written only by the launch path (service role); managers read them.
create policy "content managers read registrations" on public.content_registrations for select to authenticated
  using (public.has_permission('content_server.manage'));

revoke all on public.content_clients, public.content_licences, public.content_licence_courses,
  public.content_dispatches, public.content_registrations from anon, authenticated;
grant select, insert, update, delete on public.content_clients, public.content_licences,
  public.content_licence_courses to authenticated;
-- public_id is generated by the database; managers may create and delete dispatches, not edit them.
grant select, insert (licence_id, course_id, created_by), delete on public.content_dispatches to authenticated;
grant select on public.content_registrations to authenticated;
