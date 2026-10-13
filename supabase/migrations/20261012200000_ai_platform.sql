-- T-200 (F-700, ADR-015, ADR-040): AI platform foundation. Every AI call goes through the
-- provider adapter (src/services/ai) and is recorded here with its tokens, cost and outcome.
--
-- ai_conversations / ai_messages: learner AI Tutor chats (T-201) and any other chat feature.
-- ai_generation_jobs: one-shot generations (instructor AI, T-202) with their status and usage.
--
-- Writes happen only on the server with the service role (the adapter records usage after the
-- provider answers), so authenticated users get read access at most: their own rows, or every
-- row with the new `ai.read_all` permission (admin usage and cost screens, T-204).
--
-- Retention (SECURITY §15): conversations untouched for 12 months and finished generation jobs
-- older than 12 months are purged weekly. Account deletion removes everything through the
-- profiles foreign keys.

insert into public.permissions (id, description) values
  ('ai.read_all', 'Read AI usage, cost, conversations and generation jobs across the platform');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'ai.read_all'),
  ('super_admin', 'ai.read_all');

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  feature text not null check (feature in ('tutor', 'instructor', 'admin')),
  course_id uuid references public.courses (id) on delete set null,
  lesson_id uuid references public.lessons (id) on delete set null,
  title text check (title is null or char_length(title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);
create index ai_conversations_updated_idx on public.ai_conversations (updated_at);

create trigger ai_conversations_updated_at before update on public.ai_conversations
  for each row execute function public.set_updated_at();

-- One row per turn. Assistant rows carry the provider call's usage; user rows carry none.
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 20000),
  -- Outcome of the provider call; user rows are always 'ok'.
  status text not null default 'ok'
    check (status in ('ok', 'error', 'rate_limited', 'timeout', 'not_configured')),
  error_code text check (error_code is null or char_length(error_code) <= 100),
  provider text check (provider is null or char_length(provider) <= 50),
  model text check (model is null or char_length(model) <= 200),
  input_tokens int check (input_tokens is null or input_tokens >= 0),
  cached_input_tokens int check (cached_input_tokens is null or cached_input_tokens >= 0),
  output_tokens int check (output_tokens is null or output_tokens >= 0),
  -- null when the model has no known price (never a guessed cost).
  cost_usd numeric(12, 6) check (cost_usd is null or cost_usd >= 0),
  latency_ms int check (latency_ms is null or latency_ms >= 0),
  -- Lesson sources the answer cited (T-224): [{ "lessonId": ..., "title": ... }].
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);
create index ai_messages_created_idx on public.ai_messages (created_at);

create table public.ai_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'course_outline', 'learning_objectives', 'summary', 'quiz_questions', 'assignment_ideas',
    'review_summary', 'course_insights'
  )),
  course_id uuid references public.courses (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error_code text check (error_code is null or char_length(error_code) <= 100),
  provider text check (provider is null or char_length(provider) <= 50),
  model text check (model is null or char_length(model) <= 200),
  input_tokens int check (input_tokens is null or input_tokens >= 0),
  cached_input_tokens int check (cached_input_tokens is null or cached_input_tokens >= 0),
  output_tokens int check (output_tokens is null or output_tokens >= 0),
  cost_usd numeric(12, 6) check (cost_usd is null or cost_usd >= 0),
  latency_ms int check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index ai_generation_jobs_user_idx on public.ai_generation_jobs (user_id, created_at desc);
create index ai_generation_jobs_created_idx on public.ai_generation_jobs (created_at);

create trigger ai_generation_jobs_updated_at before update on public.ai_generation_jobs
  for each row execute function public.set_updated_at();

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_generation_jobs enable row level security;

create policy "users read own ai conversations" on public.ai_conversations for select to authenticated
  using (user_id = auth.uid() or public.has_permission('ai.read_all'));

create policy "users read own ai messages" on public.ai_messages for select to authenticated
  using (
    public.has_permission('ai.read_all')
    or exists (
      select 1 from public.ai_conversations c
       where c.id = ai_messages.conversation_id and c.user_id = auth.uid()
    )
  );

create policy "users read own ai generation jobs" on public.ai_generation_jobs for select to authenticated
  using (user_id = auth.uid() or public.has_permission('ai.read_all'));

revoke all on public.ai_conversations, public.ai_messages, public.ai_generation_jobs from anon, authenticated;
grant select on public.ai_conversations, public.ai_messages, public.ai_generation_jobs to authenticated;

-- Tutor policy (PRD §12, SECURITY §15): true while the caller has an unfinished graded attempt in
-- the course, so the tutor gives hints only. Bound to auth.uid(), never to a parameter, so nobody
-- can probe another learner's attempts. Every LMS assessment is graded; a timed attempt past its
-- deadline no longer counts.
create function public.has_active_graded_attempt(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.assessment_attempts a
      join public.assessments s on s.id = a.assessment_id
      join public.course_versions v on v.id = s.version_id
     where a.user_id = auth.uid()
       and v.course_id = p_course_id
       and a.status = 'in_progress'
       and (a.expires_at is null or a.expires_at > now())
  );
$$;
revoke all on function public.has_active_graded_attempt(uuid) from public, anon;
grant execute on function public.has_active_graded_attempt(uuid) to authenticated;

create function public.purge_old_ai_records()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  conversations integer;
  jobs integer;
begin
  delete from public.ai_conversations where updated_at < now() - interval '12 months';
  get diagnostics conversations = row_count;
  delete from public.ai_generation_jobs
   where created_at < now() - interval '12 months' and status in ('succeeded', 'failed');
  get diagnostics jobs = row_count;
  return conversations + jobs;
end;
$$;
revoke all on function public.purge_old_ai_records() from public, anon, authenticated;

-- cron.schedule() upserts by job name, so re-running this migration is safe.
select cron.schedule('purge-old-ai-records-weekly', '30 4 * * 0', $$select public.purge_old_ai_records();$$);
