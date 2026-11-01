-- T-286 (F-444): subject-rights requests (access, correction, restriction, objection, portability,
-- deletion) tracked to completion. due_at is one month after receipt (the GDPR response deadline);
-- the admin queue shows days left. Handling a request is audited from the app.
insert into public.permissions (id, description) values
  ('privacy.requests', 'Handle data-subject rights requests (Admin → Privacy requests)');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'privacy.requests'),
  ('super_admin', 'privacy.requests');

create table public.subject_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  requester_email text not null check (char_length(requester_email) between 3 and 254),
  kind text not null check (kind in ('access', 'rectification', 'erasure', 'restriction', 'objection', 'portability')),
  details text check (details is null or char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'rejected')),
  received_at timestamptz not null default now(),
  due_at timestamptz not null default (now() + interval '1 month'),
  completed_at timestamptz,
  handled_by uuid references public.profiles (id) on delete set null,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 2000),
  check ((status in ('completed', 'rejected')) = (completed_at is not null))
);
create index subject_requests_status_due_idx on public.subject_requests (status, due_at);
create index subject_requests_user_idx on public.subject_requests (user_id);

alter table public.subject_requests enable row level security;
revoke all on public.subject_requests from anon;

create policy "read own or staff" on public.subject_requests for select to authenticated
  using (user_id = auth.uid() or public.has_permission('privacy.requests'));
-- A person may only file an open request for themselves, with their own sign-in email.
create policy "file own request" on public.subject_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'open' and handled_by is null and completed_at is null
              and lower(requester_email) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "staff update" on public.subject_requests for update to authenticated
  using (public.has_permission('privacy.requests')) with check (public.has_permission('privacy.requests'));
