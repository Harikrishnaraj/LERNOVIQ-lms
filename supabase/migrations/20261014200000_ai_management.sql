-- T-204 (F-704, ADR-045): admin AI management.
--
-- 1. ai_settings: one row of platform-wide AI Tutor settings an admin changes on /admin/ai.
--    - tutor_enabled: global kill switch. Off means the tutor refuses everyone, even users an admin
--      turned it on for (ai_tutor_access, ADR-043).
--    - tutor_model: one of an allow-list of Groq models, or null for the server default
--      (AI_TUTOR_MODEL, else openai/gpt-oss-120b).
--    - max_answer_tokens, daily_question_cap, hint_only_always: safety and cost controls.
--    The defaults match the behaviour before this table existed, so nothing changes until an admin
--    edits it. Not secret: every signed-in user may read it (the learner screens show "turned
--    off"); only `ai.manage_settings` may change it, through an audited server action.
-- 2. ai_tutor_questions_since(): the daily cap's count, bound to auth.uid().
-- 3. ai_usage_report(): usage and cost aggregated in SQL for the admin screen (`ai.read_all`).
-- 4. ai_tutor_access_list(): who has the AI Tutor, with emails (`ai.manage_access`).

insert into public.permissions (id, description) values
  ('ai.manage_settings', 'Change AI Tutor settings: kill switch, model and safety limits');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'ai.manage_settings'),
  ('super_admin', 'ai.manage_settings');

create table public.ai_settings (
  id boolean primary key default true check (id),
  tutor_enabled boolean not null default true,
  -- Keep in step with TUTOR_MODELS in src/features/ai/settings-rules.ts.
  tutor_model text check (tutor_model is null or tutor_model in ('openai/gpt-oss-120b', 'openai/gpt-oss-20b')),
  max_answer_tokens int not null default 1500 check (max_answer_tokens between 300 and 3000),
  -- The ai-tutor-daily rate limit (150 per 24 hours) stays as the ceiling behind this cap.
  daily_question_cap int not null default 150 check (daily_question_cap between 1 and 150),
  hint_only_always boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
insert into public.ai_settings (id) values (true);

create trigger ai_settings_updated_at before update on public.ai_settings
  for each row execute function public.set_updated_at();

alter table public.ai_settings enable row level security;

create policy "signed-in users read ai settings" on public.ai_settings for select to authenticated
  using (true);
create policy "manage ai settings" on public.ai_settings for update to authenticated
  using (public.has_permission('ai.manage_settings'))
  with check (public.has_permission('ai.manage_settings'));

revoke all on public.ai_settings from anon, authenticated;
grant select on public.ai_settings to authenticated;
grant update (tutor_enabled, tutor_model, max_answer_tokens, daily_question_cap, hint_only_always, updated_by)
  on public.ai_settings to authenticated;

-- Questions the caller asked the tutor since p_since (the daily cap). Bound to auth.uid(), so it
-- can only ever count the caller's own questions.
create function public.ai_tutor_questions_since(p_since timestamptz)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.ai_messages m
    join public.ai_conversations c on c.id = m.conversation_id
   where c.user_id = auth.uid()
     and c.feature = 'tutor'
     and m.role = 'user'
     and m.created_at >= p_since;
$$;
revoke all on function public.ai_tutor_questions_since(timestamptz) from public, anon;
grant execute on function public.ai_tutor_questions_since(timestamptz) to authenticated;

-- Usage and cost for the last p_days UTC days (today included), aggregated here so the app never
-- loads message rows. "answered" is a model answer; "no_sources" is the fixed "couldn't find this
-- in your course" answer (no provider call, provider null); failures are counted by status. Costs
-- are summed over priced answers only: unpriced answers are counted separately, never guessed.
create function public.ai_usage_report(p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_start date;
  v_since timestamptz;
  v_result jsonb;
begin
  if not public.has_permission('ai.read_all') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'invalid period' using errcode = '22023';
  end if;
  v_start := v_today - (p_days - 1);
  v_since := v_start::timestamp at time zone 'utc';

  with answers as (
    select m.status, m.provider, m.model, m.input_tokens, m.output_tokens, m.cost_usd, m.latency_ms,
           (m.created_at at time zone 'utc')::date as day, c.user_id
      from public.ai_messages m
      join public.ai_conversations c on c.id = m.conversation_id
     where m.role = 'assistant'
       and m.created_at >= v_since
  ),
  questions as (
    select (m.created_at at time zone 'utc')::date as day, c.user_id
      from public.ai_messages m
      join public.ai_conversations c on c.id = m.conversation_id
     where m.role = 'user'
       and m.created_at >= v_since
  ),
  daily_answers as (
    select a.day,
           count(*) filter (where a.status = 'ok' and a.provider is not null) as answered,
           count(*) filter (where a.status = 'ok' and a.provider is null) as no_sources,
           count(*) filter (where a.status <> 'ok') as failed,
           sum(a.cost_usd) as cost_usd
      from answers a
     group by a.day
  ),
  daily_questions as (
    select q.day, count(*) as questions from questions q group by q.day
  ),
  models as (
    select a.model,
           count(*) filter (where a.status = 'ok') as answered,
           count(*) filter (where a.status <> 'ok') as failed,
           coalesce(sum(a.input_tokens), 0) as input_tokens,
           coalesce(sum(a.output_tokens), 0) as output_tokens,
           sum(a.cost_usd) as cost_usd,
           count(*) filter (where a.status = 'ok' and a.cost_usd is null) as unpriced,
           round(avg(a.latency_ms) filter (where a.status = 'ok')) as avg_latency_ms
      from answers a
     where a.provider is not null
     group by a.model
  ),
  top_users as (
    select q.user_id, count(*) as questions
      from questions q
     group by q.user_id
     order by count(*) desc, q.user_id
     limit 10
  )
  select jsonb_build_object(
    'days', p_days,
    'since', v_start,
    'until', v_today,
    'totals', (
      select jsonb_build_object(
        'questions', (select count(*) from questions),
        'answered', count(*) filter (where a.status = 'ok' and a.provider is not null),
        'no_sources', count(*) filter (where a.status = 'ok' and a.provider is null),
        'failed_timeout', count(*) filter (where a.status = 'timeout'),
        'failed_rate_limited', count(*) filter (where a.status = 'rate_limited'),
        'failed_error', count(*) filter (where a.status = 'error'),
        'failed_not_configured', count(*) filter (where a.status = 'not_configured'),
        'input_tokens', coalesce(sum(a.input_tokens), 0),
        'output_tokens', coalesce(sum(a.output_tokens), 0),
        'cost_usd', sum(a.cost_usd),
        'unpriced', count(*) filter (where a.status = 'ok' and a.provider is not null and a.cost_usd is null),
        'avg_latency_ms', round(avg(a.latency_ms) filter (where a.status = 'ok' and a.provider is not null))
      )
        from answers a
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', d.day::date,
               'questions', coalesce(dq.questions, 0),
               'answered', coalesce(da.answered, 0),
               'no_sources', coalesce(da.no_sources, 0),
               'failed', coalesce(da.failed, 0),
               'cost_usd', da.cost_usd
             ) order by d.day), '[]'::jsonb)
        from generate_series(v_start::timestamp, v_today::timestamp, interval '1 day') as d (day)
        left join daily_answers da on da.day = d.day::date
        left join daily_questions dq on dq.day = d.day::date
    ),
    'by_model', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'model', mo.model,
               'answered', mo.answered,
               'failed', mo.failed,
               'input_tokens', mo.input_tokens,
               'output_tokens', mo.output_tokens,
               'cost_usd', mo.cost_usd,
               'unpriced', mo.unpriced,
               'avg_latency_ms', mo.avg_latency_ms
             ) order by mo.answered desc, mo.model), '[]'::jsonb)
        from models mo
    ),
    'top_users', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'user_id', t.user_id,
               'name', p.full_name,
               'email', u.email,
               'questions', t.questions,
               'cost_usd', (select sum(a.cost_usd) from answers a where a.user_id = t.user_id)
             ) order by t.questions desc, t.user_id), '[]'::jsonb)
        from top_users t
        left join public.profiles p on p.id = t.user_id
        left join auth.users u on u.id = t.user_id
    )
  )
  into v_result;

  return v_result;
end;
$$;
revoke all on function public.ai_usage_report(integer) from public, anon;
grant execute on function public.ai_usage_report(integer) to authenticated;

-- Users with the AI Tutor turned on, newest first, with their email (auth.users) and who turned
-- it on. total is the full count before the limit.
create function public.ai_tutor_access_list(p_limit integer default 50)
returns table (
  user_id uuid,
  full_name text,
  email text,
  granted_at timestamptz,
  granted_by uuid,
  granted_by_name text,
  total bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('ai.manage_access') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select a.user_id,
         p.full_name,
         u.email::text,
         a.granted_at,
         a.granted_by,
         g.full_name,
         count(*) over ()
    from public.ai_tutor_access a
    join public.profiles p on p.id = a.user_id
    left join auth.users u on u.id = a.user_id
    left join public.profiles g on g.id = a.granted_by
   order by a.granted_at desc, a.user_id
   limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;
revoke all on function public.ai_tutor_access_list(integer) from public, anon;
grant execute on function public.ai_tutor_access_list(integer) to authenticated;
