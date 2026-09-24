-- T-076: user management (F-401).

insert into public.permissions (id, description) values
  ('user.read_all', 'See every user account'),
  ('user.manage', 'Create, invite, suspend and change roles of users');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'user.read_all'),
  ('super_admin', 'user.read_all'),
  ('support_agent', 'user.read_all'),
  ('admin', 'user.manage'),
  ('super_admin', 'user.manage');

-- A suspended account has no permissions, so a session that is already open stops working too.
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.profiles p on p.id = ur.user_id
     where ur.user_id = auth.uid()
       and rp.permission_id = p_permission
       and p.status = 'active'
  );
$$;

-- Users with their roles and email, filtered and paged in the database.
create function public.admin_users(
  p_q text default '',
  p_role text default '',
  p_status text default '',
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  status text,
  roles text[],
  created_at timestamptz,
  last_sign_in_at timestamptz,
  total bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := lower(trim(coalesce(p_q, '')));
begin
  if not public.has_permission('user.read_all') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select p.id,
         u.email::text,
         p.full_name,
         p.status,
         coalesce((select array_agg(ur.role_id order by ur.role_id) from public.user_roles ur where ur.user_id = p.id), '{}'::text[]),
         p.created_at,
         u.last_sign_in_at,
         count(*) over ()
    from public.profiles p
    join auth.users u on u.id = p.id
   where (v_q = '' or lower(u.email) like '%' || replace(replace(v_q, '%', ''), '_', '') || '%'
          or lower(coalesce(p.full_name, '')) like '%' || replace(replace(v_q, '%', ''), '_', '') || '%')
     and (coalesce(p_status, '') = '' or p.status = p_status)
     and (coalesce(p_role, '') = '' or exists (select 1 from public.user_roles r where r.user_id = p.id and r.role_id = p_role))
   order by p.created_at desc
   limit greatest(1, least(coalesce(p_limit, 25), 100))
   offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.admin_users(text, text, text, int, int) from public, anon;
grant execute on function public.admin_users(text, text, text, int, int) to authenticated;
