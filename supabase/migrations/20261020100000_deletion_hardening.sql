-- T-283 (F-441, SECURITY §21): legal-retention exceptions and a completion log for account deletion.
-- What legally must be kept is a Requires Legal Decision (docs/PRIVACY_REGISTER.md); this only gives
-- staff the switch: a held account is skipped by the purge until the hold is cleared.

alter table public.profiles add column if not exists deletion_hold_reason text;
-- No grant to authenticated: only the service role (staff tooling) sets or clears a hold.

create or replace function public.purge_expired_accounts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  purged integer := 0;
  r record;
begin
  for r in
    select id, deletion_requested_at from public.profiles
    where deletion_requested_at is not null
      and deletion_requested_at < now() - interval '30 days'
      and deletion_hold_reason is null
  loop
    -- Completion log first: it holds the id and request date only, no email or name.
    insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
    values (null, 'account.deleted', 'profile', r.id::text,
            jsonb_build_object('requestedAt', r.deletion_requested_at));
    delete from auth.users where id = r.id;
    purged := purged + 1;
  end loop;
  return purged;
end;
$$;
revoke all on function public.purge_expired_accounts() from public, anon, authenticated;
