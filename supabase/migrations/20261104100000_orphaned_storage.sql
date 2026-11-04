-- T-294, T-300 (F-448): storage objects left behind when an account or an assignment is deleted.
-- Storage rows cannot be deleted in SQL (protect_objects_delete), so this only lists them; the
-- storage-cleanup job removes them through the Storage API. Paths: avatars/<user>/<file>,
-- assignment-submissions/<assignment>/<user>/<file>.
create or replace function public.orphaned_storage_objects(p_limit int default 500)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where (
      o.bucket_id = 'avatars'
      and (storage.foldername(o.name))[1] ~ '^[0-9a-f-]{36}$'
      and not exists (select 1 from auth.users u where u.id::text = (storage.foldername(o.name))[1])
    ) or (
      o.bucket_id = 'assignment-submissions'
      and (storage.foldername(o.name))[2] ~ '^[0-9a-f-]{36}$'
      and (
        not exists (select 1 from auth.users u where u.id::text = (storage.foldername(o.name))[2])
        or not exists (select 1 from public.assignments a where a.id::text = (storage.foldername(o.name))[1])
      )
    )
  order by o.created_at
  limit greatest(1, least(p_limit, 1000));
$$;

revoke all on function public.orphaned_storage_objects(int) from public, anon, authenticated;
grant execute on function public.orphaned_storage_objects(int) to service_role;
