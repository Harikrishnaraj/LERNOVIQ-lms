-- T-083 review follow-up: you cannot report your own content (it only pollutes the moderation queue).
create or replace function public.report_discussion(p_type text, p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid := public.discussion_target_course(p_type, p_id);
  v_author uuid;
begin
  if auth.uid() is null or v_course is null or not public.can_access_discussions(v_course) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select case p_type
           when 'thread' then (select author_id from public.discussions where id = p_id)
           else (select author_id from public.discussion_posts where id = p_id)
         end into v_author;
  if v_author = auth.uid() then
    raise exception 'you cannot report your own post' using errcode = '22023';
  end if;
  insert into public.discussion_reports (reporter_id, target_type, target_id, reason)
  values (auth.uid(), p_type, p_id, trim(p_reason))
  on conflict (reporter_id, target_type, target_id) do nothing;
end;
$$;
