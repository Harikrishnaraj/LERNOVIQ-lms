-- T-073: reviewer notes linked to a section or lesson of the version under review (F-406, F-211).
-- Reviewers write them while inspecting. The course owner sees a note only once the reviewer has
-- sent a decision that goes back to the instructor (changes requested or rejected) at or after
-- the note was written, so half-finished thoughts never leak.

create table public.course_review_notes (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.course_versions (id) on delete cascade,
  target_type text not null check (target_type in ('course', 'section', 'lesson')),
  -- Section or lesson id; null for a note about the whole course. Not a foreign key because the
  -- target may be deleted later while the feedback history must stay readable.
  target_id uuid,
  target_title text not null default '',
  body text not null check (char_length(body) between 1 and 2000),
  author_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((target_type = 'course') = (target_id is null))
);
create index course_review_notes_version_idx on public.course_review_notes (version_id, created_at);

alter table public.course_review_notes enable row level security;

create policy "reviewers read notes" on public.course_review_notes for select to authenticated
  using (public.has_permission('course.review') or public.has_permission('course.read_all'));

create policy "owners read sent notes" on public.course_review_notes for select to authenticated
  using (
    exists (
      select 1
        from public.course_versions v
       where v.id = course_review_notes.version_id
         and public.owns_course(v.course_id)
         and exists (
           select 1 from public.course_reviews r
            where r.version_id = course_review_notes.version_id
              and r.action in ('request_changes', 'reject')
              and r.created_at >= course_review_notes.created_at
         )
    )
  );

create policy "reviewers add notes" on public.course_review_notes for insert to authenticated
  with check (author_id = auth.uid() and public.has_permission('course.review'));

create policy "reviewers delete own notes" on public.course_review_notes for delete to authenticated
  using (author_id = auth.uid() and public.has_permission('course.review'));

revoke update on public.course_review_notes from anon, authenticated;
