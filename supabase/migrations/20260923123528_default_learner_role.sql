-- T-018: every new signup defaults to the "learner" role. Becoming an
-- instructor/admin/etc. is an admin action (T-076), not self-service.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.user_roles (user_id, role_id) values (new.id, 'learner');
  return new;
end;
$$;
