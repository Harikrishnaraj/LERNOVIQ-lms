-- T-284 (F-442): retention jobs for the operational tables that had none. The periods are
-- proposals written in docs/RETENTION.md; legal/product can change them by editing this function.
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
  -- rate_limit_hits only self-cleans per key; sweep keys that are never seen again.
  delete from public.rate_limit_hits where hit_at < now() - interval '1 day';
  get diagnostics hits = row_count;
  return jsonb_build_object('login_history', logins, 'api_request_log', requests,
                            'enquiries', enq, 'rate_limit_hits', hits);
end;
$$;
revoke all on function public.purge_operational_data() from public, anon, authenticated;

select cron.schedule('purge-operational-data-daily', '30 3 * * *', $$select public.purge_operational_data();$$);
