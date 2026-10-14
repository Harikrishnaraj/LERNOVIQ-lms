-- T-264 (F-963, ADR-042, SECURITY §28): enquiries from the public marketing contact form.
-- The Server Action validates and rate-limits, then inserts with the service role, so neither
-- anon nor authenticated users get insert or select. Only `enquiry.read` (admin, super_admin)
-- can read them (Admin → Enquiries).

insert into public.permissions (id, description) values
  ('enquiry.read', 'Read contact-form enquiries from the marketing website (ADR-042)');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'enquiry.read'),
  ('super_admin', 'enquiry.read');

create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('consultation', 'demo')),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  organization text not null check (char_length(organization) between 1 and 160),
  country text not null check (char_length(country) between 1 and 80),
  industry text not null check (char_length(industry) between 1 and 80),
  solution text not null check (char_length(solution) between 1 and 80),
  audience text check (audience is null or char_length(audience) <= 40),
  timeline text check (timeline is null or char_length(timeline) <= 40),
  details text not null check (char_length(details) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index enquiries_created_at_idx on public.enquiries (created_at desc);

alter table public.enquiries enable row level security;

create policy "admins read enquiries" on public.enquiries for select to authenticated
  using (public.has_permission('enquiry.read'));

revoke all on public.enquiries from anon, authenticated;
grant select on public.enquiries to authenticated;
