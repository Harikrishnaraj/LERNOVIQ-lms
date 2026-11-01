-- T-279 (F-430): optional expiry on resource library items.
-- expires_at is the end of a UTC day (23:59:59.999), set by the app from a YYYY-MM-DD date, using the
-- same rule as content licences. Expired items stay in the owner's library (to extend or delete) but
-- cannot be attached to a lesson, and the app hides their attachments from learners.

alter table public.resource_library_items add column expires_at timestamptz;

-- The owner may change only the expiry of an existing item (name, path and file stay fixed).
grant update (expires_at) on public.resource_library_items to authenticated;

-- Server-side refusal: an expired resource cannot be attached, whatever client asks.
create function public.resource_usage_not_expired()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.resource_library_items r
     where r.id = new.resource_id and r.expires_at is not null and r.expires_at <= now()
  ) then
    raise exception 'resource expired' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger resource_library_usages_not_expired before insert on public.resource_library_usages
  for each row execute function public.resource_usage_not_expired();

-- The listing now returns expires_at.
drop function public.instructor_resource_library(text);
create function public.instructor_resource_library(p_query text default null)
returns table (
  id uuid,
  name text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz,
  usage_count bigint,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.name, r.storage_path, r.mime_type, r.size_bytes, r.created_at,
         count(u.id) as usage_count, r.expires_at
    from public.resource_library_items r
    left join public.resource_library_usages u on u.resource_id = r.id
   where r.owner_id = auth.uid()
     and (p_query is null or r.name ilike '%' || p_query || '%')
   group by r.id
   order by r.created_at desc;
$$;

revoke all on function public.instructor_resource_library(text) from public, anon;
grant execute on function public.instructor_resource_library(text) to authenticated;
