-- T-076: replace a user's roles atomically (delete + insert in one transaction). Service role only:
-- the server action has already checked who may change whose roles.
create function public.set_user_roles(p_user_id uuid, p_roles text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_roles is null or array_length(p_roles, 1) is null then
    raise exception 'a user needs at least one role';
  end if;
  delete from public.user_roles where user_id = p_user_id and role_id <> all (p_roles);
  insert into public.user_roles (user_id, role_id)
    select p_user_id, r from unnest(p_roles) as r
    on conflict do nothing;
end;
$$;
revoke all on function public.set_user_roles(uuid, text[]) from public, anon, authenticated;
grant execute on function public.set_user_roles(uuid, text[]) to service_role;
