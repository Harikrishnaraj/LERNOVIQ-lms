-- T-101: an instructor's private, reusable question bank (F-207). Each item stores a whole question
-- (with its answer key), so importing one into an assessment copies it: later edits to the bank do
-- not change assessments that already used it. Owner-only, no learner or staff access.

create table public.question_bank_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('mcq', 'multi', 'true_false', 'short_answer', 'essay', 'coding')),
  prompt text not null check (char_length(prompt) between 1 and 5000),
  points int not null default 1 check (points between 1 and 100),
  options jsonb not null default '[]'::jsonb,        -- [{"label": "...", "correct": true|false}]
  accepted_answers text[] not null default '{}',
  explanation text not null default '' check (char_length(explanation) <= 2000),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index question_bank_owner_idx on public.question_bank_items (owner_id, created_at desc);
create index question_bank_tags_idx on public.question_bank_items using gin (tags);
create trigger question_bank_updated_at before update on public.question_bank_items
  for each row execute function public.set_updated_at();

alter table public.question_bank_items enable row level security;
create policy "own bank" on public.question_bank_items for all to authenticated
  using (owner_id = auth.uid() and public.has_permission('course.create'))
  with check (owner_id = auth.uid() and public.has_permission('course.create'));
