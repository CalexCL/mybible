-- MyBible personal study layer
-- Safe for a future Supabase backend. Run in the Supabase SQL editor.
-- Do NOT place a service-role key in the browser application.

create extension if not exists pgcrypto;

create table if not exists public.bible_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  verse_ref text not null,
  note_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, verse_ref)
);

create table if not exists public.bible_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  verse_ref text not null,
  created_at timestamptz not null default now(),
  unique(user_id, verse_ref)
);

create table if not exists public.bible_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  verse_ref text not null,
  color text not null default 'gold',
  created_at timestamptz not null default now(),
  unique(user_id, verse_ref)
);

alter table public.bible_notes enable row level security;
alter table public.bible_bookmarks enable row level security;
alter table public.bible_highlights enable row level security;

create policy "Users read own Bible notes"
on public.bible_notes for select
using (auth.uid() = user_id);

create policy "Users insert own Bible notes"
on public.bible_notes for insert
with check (auth.uid() = user_id);

create policy "Users update own Bible notes"
on public.bible_notes for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users delete own Bible notes"
on public.bible_notes for delete
using (auth.uid() = user_id);

create policy "Users read own Bible bookmarks"
on public.bible_bookmarks for select
using (auth.uid() = user_id);

create policy "Users insert own Bible bookmarks"
on public.bible_bookmarks for insert
with check (auth.uid() = user_id);

create policy "Users delete own Bible bookmarks"
on public.bible_bookmarks for delete
using (auth.uid() = user_id);

create policy "Users read own Bible highlights"
on public.bible_highlights for select
using (auth.uid() = user_id);

create policy "Users insert own Bible highlights"
on public.bible_highlights for insert
with check (auth.uid() = user_id);

create policy "Users update own Bible highlights"
on public.bible_highlights for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users delete own Bible highlights"
on public.bible_highlights for delete
using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bible_notes_set_updated_at on public.bible_notes;
create trigger bible_notes_set_updated_at
before update on public.bible_notes
for each row execute function public.set_updated_at();
