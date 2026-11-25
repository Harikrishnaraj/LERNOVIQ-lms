-- Report audit C41: an organisation-wide assignment counted members who joined the organisation
-- after its due date as overdue. They are still assigned (and count in total_assigned and
-- completed_count), but are overdue only if they were a member by the due date
-- (organization_members.created_at <= due_at). This applies to every scope: someone who joined the
-- organisation after the due date cannot have been in the team, or been assigned, before it.
-- Limitation: there is no team join timestamp, so a member who moved into a team after the due date
-- still counts as overdue for a team assignment. Members who have left the organisation have no
-- organization_members row and are not counted at all (as before).
-- Latest definition copied from 20260929100000_assigned_learning.sql; return columns unchanged.

create or replace function public.list_org_assigned_learning(p_org_id uuid)
returns table (
  id uuid,
  scope text,
  team_name text,
  user_full_name text,
  user_email text,
  content_type text,
  title text,
  due_at timestamptz,
  created_at timestamptz,
  total_assigned bigint,
  completed_count bigint,
  overdue_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.has_permission('organizations.manage') or public.is_org_admin(p_org_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select al.id, al.scope, t.name, p.full_name, u.email::text, al.content_type,
         coalesce(cv.title, lp.title, c.slug) as title,
         al.due_at, al.created_at,
         count(target.user_id) as total_assigned,
         count(target.user_id) filter (where target.is_complete) as completed_count,
         count(target.user_id) filter (where not target.is_complete and al.due_at is not null and al.due_at < now()
                                        and target.joined_at <= al.due_at) as overdue_count
    from public.assigned_learning al
    left join public.teams t on t.id = al.team_id
    left join public.profiles p on p.id = al.user_id
    left join auth.users u on u.id = al.user_id
    left join public.courses c on c.id = al.course_id
    left join public.course_versions cv on cv.id = c.published_version_id
    left join public.learning_paths lp on lp.id = al.path_id
    left join lateral (
      select m.user_id,
             m.joined_at,
             case
               when al.content_type = 'course' then exists (
                 select 1 from public.enrollments e where e.user_id = m.user_id and e.course_id = al.course_id and e.status = 'completed'
               )
               else (
                 select count(*) from public.learning_path_courses lpc where lpc.path_id = al.path_id
               ) > 0 and (
                 select count(*) from public.learning_path_courses lpc where lpc.path_id = al.path_id
               ) = (
                 select count(*) from public.learning_path_courses lpc
                  join public.enrollments e2 on e2.course_id = lpc.course_id and e2.user_id = m.user_id and e2.status = 'completed'
                 where lpc.path_id = al.path_id
               )
             end as is_complete
        from (
          select om.user_id, om.created_at as joined_at
            from public.organization_members om
           where (al.scope = 'organization' and om.organization_id = al.organization_id)
              or (al.scope = 'team' and om.team_id = al.team_id)
              or (al.scope = 'user' and om.user_id = al.user_id)
        ) m
    ) target on true
   where al.organization_id = p_org_id
   group by al.id, t.name, p.full_name, u.email, c.slug, cv.title, lp.title
   order by al.created_at desc;
end;
$$;
revoke all on function public.list_org_assigned_learning(uuid) from public, anon;
grant execute on function public.list_org_assigned_learning(uuid) to authenticated;
