create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.analysis_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('queued', 'processing', 'completed', 'failed')),
  video jsonb not null,
  transcript jsonb,
  transcript_source text check (transcript_source in ('mock', 'remote')),
  result jsonb,
  chat_messages jsonb not null default '[]'::jsonb,
  error_message text,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists analysis_records_user_created_idx
  on public.analysis_records (user_id, created_at desc);

create index if not exists analysis_records_user_archived_idx
  on public.analysis_records (user_id, archived_at);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('analysis_completed', 'analysis_failed', 'system')),
  title text not null,
  body text not null,
  related_analysis_id uuid references public.analysis_records(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

create index if not exists user_notifications_user_read_idx
  on public.user_notifications (user_id, read_at);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  avatar_url text,
  notifications_enabled boolean not null default true,
  theme_preference text not null default 'system'
    check (theme_preference in ('system', 'light', 'dark')),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.analysis_transcript_chunks (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analysis_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_index integer not null,
  text text not null,
  start_seconds numeric,
  end_seconds numeric,
  embedding vector(1536) not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (analysis_id, chunk_index)
);

create index if not exists analysis_transcript_chunks_analysis_chunk_idx
  on public.analysis_transcript_chunks (analysis_id, chunk_index);

create index if not exists analysis_transcript_chunks_embedding_idx
  on public.analysis_transcript_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_analysis_records_updated_at on public.analysis_records;
create trigger set_analysis_records_updated_at
before update on public.analysis_records
for each row
execute function public.set_updated_at();

drop trigger if exists set_user_settings_updated_at on public.user_settings;
create trigger set_user_settings_updated_at
before update on public.user_settings
for each row
execute function public.set_updated_at();

alter table public.analysis_records enable row level security;
alter table public.analysis_transcript_chunks enable row level security;
alter table public.user_notifications enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "users can view own analysis records" on public.analysis_records;
create policy "users can view own analysis records"
on public.analysis_records
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can insert own analysis records" on public.analysis_records;
create policy "users can insert own analysis records"
on public.analysis_records
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update own analysis records" on public.analysis_records;
create policy "users can update own analysis records"
on public.analysis_records
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can view own transcript chunks" on public.analysis_transcript_chunks;
create policy "users can view own transcript chunks"
on public.analysis_transcript_chunks
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can view own notifications" on public.user_notifications;
create policy "users can view own notifications"
on public.user_notifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can update own notifications" on public.user_notifications;
create policy "users can update own notifications"
on public.user_notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can view own settings" on public.user_settings;
create policy "users can view own settings"
on public.user_settings
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can insert own settings" on public.user_settings;
create policy "users can insert own settings"
on public.user_settings
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update own settings" on public.user_settings;
create policy "users can update own settings"
on public.user_settings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.match_analysis_transcript_chunks(
  filter_analysis_id uuid,
  filter_user_id uuid,
  query_embedding vector(1536),
  match_count integer default 4
)
returns table (
  id uuid,
  analysis_id uuid,
  user_id uuid,
  chunk_index integer,
  text text,
  start_seconds numeric,
  end_seconds numeric,
  score float
)
language sql
stable
as $$
  select
    chunk.id,
    chunk.analysis_id,
    chunk.user_id,
    chunk.chunk_index,
    chunk.text,
    chunk.start_seconds,
    chunk.end_seconds,
    1 - (chunk.embedding <=> query_embedding) as score
  from public.analysis_transcript_chunks as chunk
  where chunk.analysis_id = filter_analysis_id
    and chunk.user_id = filter_user_id
  order by chunk.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
