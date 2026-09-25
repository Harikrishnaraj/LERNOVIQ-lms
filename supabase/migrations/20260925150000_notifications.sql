-- T-085: in-app notifications (F-115). Rows are created server-side only (service role, through
-- notify() which honours the user's preferences). Users read their own, mark them read, delete them.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('course', 'assignment', 'discussion', 'review', 'system')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 1000),
  href text check (href is null or (href like '/%' and href not like '//%')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('course', 'assignment', 'discussion', 'review', 'system')),
  in_app boolean not null default true,
  primary key (user_id, category)
);

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

create policy "read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "update own notifications" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own notifications" on public.notifications for delete to authenticated using (user_id = auth.uid());

create policy "read own preferences" on public.notification_preferences for select to authenticated using (user_id = auth.uid());
create policy "insert own preferences" on public.notification_preferences for insert to authenticated with check (user_id = auth.uid());
create policy "update own preferences" on public.notification_preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;
