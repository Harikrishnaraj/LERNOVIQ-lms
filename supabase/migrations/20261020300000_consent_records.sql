-- T-285 (F-443): where consent is the legal basis, store which policy text was agreed to, when,
-- for what exact purpose, and whether it has been withdrawn. Today the only consent-based flow is
-- the marketing-site enquiry checkbox; the table takes other purposes by extending the check.
create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  subject_email text check (subject_email is null or char_length(subject_email) <= 254),
  purpose text not null check (purpose in ('enquiry_contact')),
  purpose_text text not null check (char_length(purpose_text) between 1 and 1000),
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  source_id text,
  given_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  check (user_id is not null or subject_email is not null),
  check (withdrawn_at is null or withdrawn_at >= given_at)
);
create index consent_records_user_idx on public.consent_records (user_id);
create index consent_records_email_idx on public.consent_records (lower(subject_email));

alter table public.consent_records enable row level security;
-- Signed-in people can read their own records; writes go through the service role only.
create policy "read own consent" on public.consent_records for select to authenticated
  using (user_id = auth.uid());
revoke all on public.consent_records from anon;
revoke insert, update, delete on public.consent_records from authenticated;

-- A visitor's consent record follows the retention of the enquiry it came from.
create or replace function public.purge_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  logins integer;
  requests integer;
  enq integer;
  hits integer;
begin
  delete from public.login_history where created_at < now() - interval '12 months';
  get diagnostics logins = row_count;
  delete from public.api_request_log where created_at < now() - interval '90 days';
  get diagnostics requests = row_count;
  delete from public.enquiries where created_at < now() - interval '24 months';
  get diagnostics enq = row_count;
  delete from public.consent_records
   where purpose = 'enquiry_contact' and user_id is null and given_at < now() - interval '24 months';
  delete from public.rate_limit_hits where hit_at < now() - interval '1 day';
  get diagnostics hits = row_count;
  return jsonb_build_object('login_history', logins, 'api_request_log', requests,
                            'enquiries', enq, 'rate_limit_hits', hits);
end;
$$;
revoke all on function public.purge_operational_data() from public, anon, authenticated;
