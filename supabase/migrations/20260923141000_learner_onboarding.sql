-- T-022: learner interests/goals captured after first login (feeds recommendations, T-042).
create table public.learner_onboarding (
  user_id uuid primary key references auth.users (id) on delete cascade,
  interests text[] not null default '{}',
  goals text[] not null default '{}',
  completed_at timestamptz not null default now()
);
alter table public.learner_onboarding enable row level security;

create policy "read own onboarding" on public.learner_onboarding
  for select to authenticated using (auth.uid() = user_id);
create policy "insert own onboarding" on public.learner_onboarding
  for insert to authenticated with check (auth.uid() = user_id);
create policy "update own onboarding" on public.learner_onboarding
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
