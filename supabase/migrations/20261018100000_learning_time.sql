-- T-292 (F-420): time actually spent per learner per lesson, for the User product duration report.
-- One row per enrolment, lesson and UTC day. Written only through record_lesson_time, which caps
-- what one heartbeat can add, so a client cannot claim more time than has really passed.

create table public.lesson_time (
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  day date not null,
  seconds int not null default 0 check (seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (enrollment_id, lesson_id, day)
);

create index lesson_time_day_idx on public.lesson_time (day);

-- No policies: nobody reads or writes the table directly. Writes go through the function below,
-- reports through the admin function.
alter table public.lesson_time enable row level security;

-- Adds up to 60 seconds for the signed-in learner on a lesson of a course they are enrolled in.
-- The credit is also capped by the real time since this lesson's last heartbeat today.
create function public.record_lesson_time(p_lesson_id uuid, p_seconds int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment uuid;
  v_credit int;
  v_today date := (now() at time zone 'utc')::date;
  v_last timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_seconds is null or p_seconds <= 0 then
    return 0;
  end if;

  select e.id into v_enrollment
    from public.enrollments e
    join public.course_sections s on s.version_id = e.version_id
    join public.lessons l on l.section_id = s.id
   where l.id = p_lesson_id
     and e.user_id = auth.uid()
     and e.status <> 'cancelled'
   limit 1;
  if v_enrollment is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select updated_at into v_last
    from public.lesson_time
   where enrollment_id = v_enrollment and lesson_id = p_lesson_id and day = v_today;

  v_credit := least(p_seconds, 60);
  if v_last is not null then
    v_credit := least(v_credit, greatest(0, floor(extract(epoch from (now() - v_last)))::int));
  end if;
  if v_credit <= 0 then
    return 0;
  end if;

  insert into public.lesson_time (enrollment_id, lesson_id, day, seconds)
  values (v_enrollment, p_lesson_id, v_today, v_credit)
  on conflict (enrollment_id, lesson_id, day)
  do update set seconds = public.lesson_time.seconds + excluded.seconds, updated_at = now();
  return v_credit;
end;
$$;
revoke all on function public.record_lesson_time(uuid, int) from public, anon;
grant execute on function public.record_lesson_time(uuid, int) to authenticated;

-- One row per enrolment with time recorded in the last p_days days (UTC days, today included).
create function public.admin_report_user_product_duration(p_days int default 30)
returns table (
  user_id uuid, full_name text, course_id uuid, course_title text,
  total_seconds bigint, lessons_with_time int, active_days int, last_active_day date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not public.has_permission('analytics.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select e.user_id,
         p.full_name,
         e.course_id,
         v.title,
         sum(t.seconds)::bigint,
         count(distinct t.lesson_id)::int,
         count(distinct t.day)::int,
         max(t.day)
    from public.lesson_time t
    join public.enrollments e on e.id = t.enrollment_id
    join public.profiles p on p.id = e.user_id
    join public.course_versions v on v.id = e.version_id
   where t.day > ((now() at time zone 'utc')::date - v_days)
   group by e.user_id, p.full_name, e.course_id, v.title
   order by 5 desc, 1
   limit 10000;
end;
$$;
revoke all on function public.admin_report_user_product_duration(int) from public, anon;
grant execute on function public.admin_report_user_product_duration(int) to authenticated;
