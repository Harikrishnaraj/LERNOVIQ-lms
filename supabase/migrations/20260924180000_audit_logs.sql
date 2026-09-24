-- T-070: append-only audit log (SECURITY section 17, F-414).
-- Rows are written server-side only (service role, via recordAudit). Nobody can update or delete
-- them, not even the service role: the trigger refuses unless a retention job explicitly sets
-- app.audit_purge (T-243). Only holders of audit.read can read.

insert into public.permissions (id, description) values
  ('audit.read', 'Read the audit log');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'audit.read'),
  ('super_admin', 'audit.read');

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  -- No foreign key on purpose: the record must outlive the user, so the email is snapshotted.
  actor_id uuid,
  actor_email text,
  action text not null check (char_length(action) between 1 and 100),
  resource_type text not null check (char_length(resource_type) between 1 and 100),
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);
create index audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);

alter table public.audit_logs enable row level security;

create policy "audit readers can read" on public.audit_logs for select to authenticated
  using (public.has_permission('audit.read'));

revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;

create function public.audit_logs_immutable()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.audit_purge', true) = 'on' then
    if tg_op = 'DELETE' then return old; elsif tg_op = 'UPDATE' then return new; end if;
    return null;
  end if;
  raise exception 'audit_logs is append-only';
end;
$$;

create trigger audit_logs_no_change before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.audit_logs_immutable();
