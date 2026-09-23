-- T-021: sliding-window rate limiter backing src/services/rate-limit.
create table public.rate_limit_hits (
  id bigint generated always as identity primary key,
  key text not null,
  hit_at timestamptz not null default now()
);
create index rate_limit_hits_key_hit_at_idx on public.rate_limit_hits (key, hit_at);
alter table public.rate_limit_hits enable row level security; -- no policies: service role only

-- Returns true (and records a hit) while the key has fewer than p_limit hits
-- in the last p_window_seconds, false otherwise.
create function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hits int;
begin
  delete from public.rate_limit_hits
   where key = p_key and hit_at < now() - make_interval(secs => p_window_seconds);
  select count(*) into hits from public.rate_limit_hits where key = p_key;
  if hits >= p_limit then
    return false;
  end if;
  insert into public.rate_limit_hits (key) values (p_key);
  return true;
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;
