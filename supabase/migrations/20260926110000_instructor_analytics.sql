-- T-107: Instructor Analytics Overview (F-216)
-- Provides metrics scoped strictly to courses owned by the authenticated instructor (c.instructor_id = auth.uid()).
-- Includes date range filter, optional course filter, enrollments, completions, completion rate, active learners, revenue KPIs.

-- 1. Helper to list courses owned by instructor for filter dropdown
create or replace function public.instructor_analytics_courses()
returns table (
  id uuid,
  title text,
  slug text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         coalesce(v.title, 'Untitled course') as title,
         c.slug
    from public.courses c
    left join public.course_versions v on v.id = coalesce(c.published_version_id, (
      select v2.id from public.course_versions v2 where v2.course_id = c.id order by v2.version_number desc limit 1
    ))
   where c.instructor_id = auth.uid()
   order by v.title asc, c.created_at desc;
$$;
revoke all on function public.instructor_analytics_courses() from public, anon;
grant execute on function public.instructor_analytics_courses() to authenticated;

-- 2. Daily trend points for the selected range and course
create or replace function public.instructor_analytics_daily(
  p_days int default 30,
  p_course_id uuid default null
)
returns table (
  day date,
  enrollments int,
  completions int,
  active_learners int,
  revenue_cents int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
  v_start date := current_date - (v_days - 1);
begin
  -- If course filter provided, ensure it belongs to the caller
  if p_course_id is not null and not exists (
    select 1 from public.courses where id = p_course_id and instructor_id = auth.uid()
  ) then
    -- Return nothing for unauthorized course
    return;
  end if;

  return query
  with days as (
    select d::date as day
      from generate_series(v_start, current_date, interval '1 day') as d
  ),
  scoped_courses as (
    select id from public.courses
     where instructor_id = auth.uid()
       and (p_course_id is null or id = p_course_id)
  ),
  day_enrollments as (
    select e.enrolled_at::date as day,
           count(*)::int as enrollments,
           coalesce(sum(coalesce(v.price_cents, 0)), 0)::int as revenue_cents
      from public.enrollments e
      join public.course_versions v on v.id = e.version_id
     where e.course_id in (select id from scoped_courses)
       and e.status <> 'cancelled'
       and e.enrolled_at::date >= v_start
     group by e.enrolled_at::date
  ),
  day_completions as (
    select e.completed_at::date as day,
           count(*)::int as completions
      from public.enrollments e
     where e.course_id in (select id from scoped_courses)
       and e.completed_at is not null
       and e.completed_at::date >= v_start
     group by e.completed_at::date
  ),
  day_activity as (
    select act.day, count(distinct act.user_id)::int as active_learners
      from (
        select e.enrolled_at::date as day, e.user_id
          from public.enrollments e
         where e.course_id in (select id from scoped_courses)
           and e.status <> 'cancelled'
           and e.enrolled_at::date >= v_start
        union
        select lp.updated_at::date as day, e.user_id
          from public.lesson_progress lp
          join public.enrollments e on e.id = lp.enrollment_id
         where e.course_id in (select id from scoped_courses)
           and lp.updated_at::date >= v_start
        union
        select a.started_at::date as day, a.user_id
          from public.assessment_attempts a
          join public.enrollments e on e.id = a.enrollment_id
         where e.course_id in (select id from scoped_courses)
           and a.started_at::date >= v_start
      ) act
     group by act.day
  )
  select d.day,
         coalesce(de.enrollments, 0)::int as enrollments,
         coalesce(dc.completions, 0)::int as completions,
         coalesce(da.active_learners, 0)::int as active_learners,
         coalesce(de.revenue_cents, 0)::int as revenue_cents
    from days d
    left join day_enrollments de on de.day = d.day
    left join day_completions dc on dc.day = d.day
    left join day_activity da on da.day = d.day
   order by d.day;
end;
$$;
revoke all on function public.instructor_analytics_daily(int, uuid) from public, anon;
grant execute on function public.instructor_analytics_daily(int, uuid) to authenticated;

-- 3. Course breakdown in the selected range
create or replace function public.instructor_analytics_courses_breakdown(
  p_days int default 30,
  p_course_id uuid default null
)
returns table (
  course_id uuid,
  title text,
  slug text,
  enrollments int,
  completions int,
  completion_rate int,
  active_learners int,
  revenue_cents int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
  v_start date := current_date - (v_days - 1);
begin
  if p_course_id is not null and not exists (
    select 1 from public.courses where id = p_course_id and instructor_id = auth.uid()
  ) then
    return;
  end if;

  return query
  with scoped_courses as (
    select c.id,
           coalesce(v.title, 'Untitled course') as title,
           c.slug
      from public.courses c
      left join public.course_versions v on v.id = coalesce(c.published_version_id, (
        select v2.id from public.course_versions v2 where v2.course_id = c.id order by v2.version_number desc limit 1
      ))
     where c.instructor_id = auth.uid()
       and (p_course_id is null or c.id = p_course_id)
  )
  select sc.id as course_id,
         sc.title,
         sc.slug,
         count(e.id) filter (where e.enrolled_at::date >= v_start and e.status <> 'cancelled')::int as enrollments,
         count(e.id) filter (where e.completed_at::date >= v_start)::int as completions,
         case
           when count(e.id) filter (where e.enrolled_at::date >= v_start and e.status <> 'cancelled') = 0 then 0
           else round((count(e.id) filter (where e.completed_at::date >= v_start)::numeric /
                       count(e.id) filter (where e.enrolled_at::date >= v_start and e.status <> 'cancelled')::numeric) * 100)::int
         end as completion_rate,
         (
           select count(distinct act.user_id)::int
             from (
               select e2.user_id
                 from public.enrollments e2
                where e2.course_id = sc.id
                  and e2.status <> 'cancelled'
                  and e2.enrolled_at::date >= v_start
               union
               select e3.user_id
                 from public.lesson_progress lp
                 join public.enrollments e3 on e3.id = lp.enrollment_id
                where e3.course_id = sc.id
                  and lp.updated_at::date >= v_start
               union
               select a.user_id
                 from public.assessment_attempts a
                 join public.enrollments e4 on e4.id = a.enrollment_id
                where e4.course_id = sc.id
                  and a.started_at::date >= v_start
             ) act
         ) as active_learners,
         coalesce(sum(coalesce(cv.price_cents, 0)) filter (where e.enrolled_at::date >= v_start and e.status <> 'cancelled'), 0)::int as revenue_cents
    from scoped_courses sc
    left join public.enrollments e on e.course_id = sc.id
    left join public.course_versions cv on cv.id = e.version_id
   group by sc.id, sc.title, sc.slug
   order by enrollments desc, sc.title asc;
end;
$$;
revoke all on function public.instructor_analytics_courses_breakdown(int, uuid) from public, anon;
grant execute on function public.instructor_analytics_courses_breakdown(int, uuid) to authenticated;
