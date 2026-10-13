-- T-171/T-173/T-176 (F-520, F-522, F-524, ADR-041): what the content server needs beyond the
-- T-170 tables: which courses can be dispatched, the atomic launch-time licence and seat check,
-- a launch log for usage reports, and the usage report itself.
--
-- Phase 1 dispatches SCORM 1.2 packages only, one per course: the first SCORM 1.2 lesson of the
-- course's published version, in section/lesson order.

-- The SCORM 1.2 lesson a dispatch of this course launches, or null when the published version has
-- none. Read by the service-role launch path and by the admin course picker below.
create function public.content_course_scorm_lesson(p_course_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.id
    from public.courses c
    join public.course_sections s on s.version_id = c.published_version_id
    join public.lessons l on l.section_id = s.id and l.type = 'scorm'
    join public.scorm_packages p on p.lesson_id = l.id and p.version = '1.2'
   where c.id = p_course_id
   order by s.position, l.position, l.id
   limit 1;
$$;
revoke all on function public.content_course_scorm_lesson(uuid) from public, anon, authenticated;
grant execute on function public.content_course_scorm_lesson(uuid) to service_role;

-- Published courses that have a SCORM 1.2 lesson: what an admin may add to a licence.
create function public.content_dispatchable_courses(p_q text default '')
returns table (course_id uuid, title text, slug text, lesson_title text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('content_server.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select c.id, v.title, c.slug, l.title
      from public.courses c
      join public.course_versions v on v.id = c.published_version_id
      join public.lessons l on l.id = public.content_course_scorm_lesson(c.id)
     where coalesce(btrim(p_q), '') = '' or v.title ilike '%' || btrim(p_q) || '%' or c.slug ilike '%' || btrim(p_q) || '%'
     order by v.title
     limit 50;
end;
$$;
revoke all on function public.content_dispatchable_courses(text) from public, anon;
grant execute on function public.content_dispatchable_courses(text) to authenticated;

-- Whether a course can be added to a licence (published, with a SCORM 1.2 lesson). Managers only.
create function public.content_course_is_dispatchable(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('content_server.manage') and public.content_course_scorm_lesson(p_course_id) is not null;
$$;
revoke all on function public.content_course_is_dispatchable(uuid) from public, anon;
grant execute on function public.content_course_is_dispatchable(uuid) to authenticated;

-- One row per launch, for "launches per month" (registrations only keep first/last/count).
create table public.content_launch_events (
  id bigint generated always as identity primary key,
  licence_id uuid not null references public.content_licences (id) on delete cascade,
  dispatch_id uuid not null references public.content_dispatches (id) on delete cascade,
  registration_id uuid not null references public.content_registrations (id) on delete cascade,
  launched_at timestamptz not null default now()
);
create index content_launch_events_licence_idx on public.content_launch_events (licence_id, launched_at);
alter table public.content_launch_events enable row level security;
create policy "content managers read launch events" on public.content_launch_events for select to authenticated
  using (public.has_permission('content_server.manage'));
revoke all on public.content_launch_events from anon, authenticated;
grant select on public.content_launch_events to authenticated;

/**
 * Launch-time check and registration, in one transaction with the licence row locked so two
 * simultaneous first launches cannot both take the last seat. Order (SECURITY §27): licence not
 * revoked, not expired, course still has a dispatchable lesson, seat limit (a learner who already
 * holds a seat on this licence always gets in; only a new learner can be refused). Signature and
 * embedding origin are checked by the caller before this runs.
 * Returns {status, registration_id?, lesson_id?, licence_id?}; status is one of
 * ok, not_found, revoked, expired, unavailable, seat_limit.
 */
create function public.register_content_launch(p_public_id text, p_learner_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispatch public.content_dispatches%rowtype;
  v_licence public.content_licences%rowtype;
  v_lesson uuid;
  v_reg uuid;
  v_has_seat boolean;
  v_used int;
begin
  if p_learner_key !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_dispatch from public.content_dispatches where public_id = p_public_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_licence from public.content_licences where id = v_dispatch.licence_id for update;
  if v_licence.revoked_at is not null then
    return jsonb_build_object('status', 'revoked');
  end if;
  if v_licence.expires_at is not null and v_licence.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  v_lesson := public.content_course_scorm_lesson(v_dispatch.course_id);
  if v_lesson is null then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select id into v_reg from public.content_registrations
   where dispatch_id = v_dispatch.id and learner_key = p_learner_key;
  if v_reg is null then
    select exists (select 1 from public.content_registrations where licence_id = v_licence.id and learner_key = p_learner_key)
      into v_has_seat;
    if not v_has_seat and v_licence.seat_limit is not null then
      select count(distinct learner_key) into v_used from public.content_registrations where licence_id = v_licence.id;
      if v_used >= v_licence.seat_limit then
        return jsonb_build_object('status', 'seat_limit');
      end if;
    end if;
    insert into public.content_registrations (dispatch_id, learner_key)
      values (v_dispatch.id, p_learner_key) returning id into v_reg;
  else
    update public.content_registrations
       set last_launch_at = now(), launch_count = launch_count + 1
     where id = v_reg;
  end if;

  insert into public.content_launch_events (licence_id, dispatch_id, registration_id)
    values (v_licence.id, v_dispatch.id, v_reg);

  return jsonb_build_object('status', 'ok', 'registration_id', v_reg, 'lesson_id', v_lesson, 'licence_id', v_licence.id);
end;
$$;
revoke all on function public.register_content_launch(text, text) from public, anon, authenticated;
grant execute on function public.register_content_launch(text, text) to service_role;

-- Whether a registration may still load content (checked on every content request, so revoking or
-- expiring a licence takes effect immediately, not when a token runs out).
create function public.content_registration_active(p_registration_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'active', l.revoked_at is null and (l.expires_at is null or l.expires_at > now()),
           'allowed_origins', to_jsonb(l.allowed_origins))
    from public.content_registrations r
    join public.content_licences l on l.id = r.licence_id
   where r.id = p_registration_id;
$$;
revoke all on function public.content_registration_active(uuid) from public, anon, authenticated;
grant execute on function public.content_registration_active(uuid) to service_role;

-- T-176: usage per licence, course and month for one client.
create function public.content_client_usage(p_client_id uuid)
returns table (
  licence_id uuid, licence_name text, course_id uuid, course_title text,
  month date, new_learners int, active_learners int, launches int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('content_server.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    with ev as (
      select e.licence_id, d.course_id, date_trunc('month', e.launched_at)::date as month,
             count(*)::int as launches, count(distinct e.registration_id)::int as active
        from public.content_launch_events e
        join public.content_dispatches d on d.id = e.dispatch_id
        join public.content_licences l on l.id = e.licence_id
       where l.client_id = p_client_id
       group by 1, 2, 3
    ), nw as (
      select r.licence_id, d.course_id, date_trunc('month', r.first_launch_at)::date as month, count(*)::int as n
        from public.content_registrations r
        join public.content_dispatches d on d.id = r.dispatch_id
        join public.content_licences l on l.id = r.licence_id
       where l.client_id = p_client_id
       group by 1, 2, 3
    )
    select ev.licence_id, l.name, ev.course_id, coalesce(v.title, c.slug), ev.month,
           coalesce(nw.n, 0), ev.active, ev.launches
      from ev
      join public.content_licences l on l.id = ev.licence_id
      join public.courses c on c.id = ev.course_id
      left join public.course_versions v on v.id = c.published_version_id
      left join nw on nw.licence_id = ev.licence_id and nw.course_id = ev.course_id and nw.month = ev.month
     order by ev.month desc, l.name, 4;
end;
$$;
revoke all on function public.content_client_usage(uuid) from public, anon;
grant execute on function public.content_client_usage(uuid) to authenticated;
