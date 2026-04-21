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

create index if not exists analysis_transcript_chunks_text_search_idx
  on public.analysis_transcript_chunks
  using gin (to_tsvector('simple', text));

create table if not exists public.analysis_jobs (
  analysis_id uuid primary key references public.analysis_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  stage text not null default 'queued'
    check (stage in ('queued', 'transcript', 'summary', 'indexing', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts >= 1),
  next_run_at timestamptz not null default timezone('utc', now()),
  lease_owner text,
  lease_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists analysis_jobs_status_next_run_idx
  on public.analysis_jobs (status, next_run_at asc);

create index if not exists analysis_jobs_lease_expiration_idx
  on public.analysis_jobs (lease_expires_at asc)
  where status = 'running';

create table if not exists public.agent_checkpoints (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analysis_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null
    check (stage in ('queued', 'transcript', 'summary', 'indexing', 'completed', 'failed')),
  attempt integer not null check (attempt >= 1),
  status text not null
    check (status in ('started', 'completed', 'failed')),
  payload jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (analysis_id, stage, attempt)
);

create index if not exists agent_checkpoints_analysis_stage_idx
  on public.agent_checkpoints (analysis_id, stage, attempt desc);

create table if not exists public.memory_store (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analysis_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_key text not null,
  kind text not null,
  content text not null,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (analysis_id, memory_key)
);

create index if not exists memory_store_analysis_updated_idx
  on public.memory_store (analysis_id, updated_at desc);

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

drop trigger if exists set_analysis_jobs_updated_at on public.analysis_jobs;
create trigger set_analysis_jobs_updated_at
before update on public.analysis_jobs
for each row
execute function public.set_updated_at();

drop trigger if exists set_agent_checkpoints_updated_at on public.agent_checkpoints;
create trigger set_agent_checkpoints_updated_at
before update on public.agent_checkpoints
for each row
execute function public.set_updated_at();

drop trigger if exists set_memory_store_updated_at on public.memory_store;
create trigger set_memory_store_updated_at
before update on public.memory_store
for each row
execute function public.set_updated_at();

alter table public.analysis_records enable row level security;
alter table public.analysis_transcript_chunks enable row level security;
alter table public.analysis_jobs enable row level security;
alter table public.agent_checkpoints enable row level security;
alter table public.memory_store enable row level security;
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

drop policy if exists "users can view own analysis jobs" on public.analysis_jobs;
create policy "users can view own analysis jobs"
on public.analysis_jobs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can view own checkpoints" on public.agent_checkpoints;
create policy "users can view own checkpoints"
on public.agent_checkpoints
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can view own memory store" on public.memory_store;
create policy "users can view own memory store"
on public.memory_store
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can insert own memory store" on public.memory_store;
create policy "users can insert own memory store"
on public.memory_store
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update own memory store" on public.memory_store;
create policy "users can update own memory store"
on public.memory_store
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can delete own memory store" on public.memory_store;
create policy "users can delete own memory store"
on public.memory_store
for delete
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
  match_count integer default 4,
  filter_start_seconds numeric default null,
  filter_end_seconds numeric default null
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
    and (
      filter_start_seconds is null
      or coalesce(chunk.end_seconds, chunk.start_seconds, 0) >= filter_start_seconds
    )
    and (
      filter_end_seconds is null
      or coalesce(chunk.start_seconds, chunk.end_seconds, 0) <= filter_end_seconds
    )
  order by chunk.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

create or replace function public.claim_analysis_job(
  claim_analysis_id uuid,
  claim_worker_id text,
  claim_lease_seconds integer default 120
)
returns setof public.analysis_jobs
language plpgsql
as $$
begin
  return query
  update public.analysis_jobs as job
  set
    status = 'running',
    attempt_count = job.attempt_count + 1,
    lease_owner = claim_worker_id,
    lease_expires_at = timezone('utc', now()) + make_interval(secs => greatest(claim_lease_seconds, 30)),
    last_heartbeat_at = timezone('utc', now()),
    started_at = coalesce(job.started_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  where job.analysis_id = claim_analysis_id
    and job.status in ('queued', 'running')
    and job.next_run_at <= timezone('utc', now())
    and (
      job.status = 'queued'
      or coalesce(job.lease_expires_at, timezone('utc', now()) - interval '1 second')
        <= timezone('utc', now())
    )
  returning job.*;
end;
$$;

create or replace function public.heartbeat_analysis_job(
  claim_analysis_id uuid,
  claim_worker_id text,
  claim_lease_seconds integer default 120
)
returns setof public.analysis_jobs
language plpgsql
as $$
begin
  return query
  update public.analysis_jobs as job
  set
    last_heartbeat_at = timezone('utc', now()),
    lease_expires_at = timezone('utc', now()) + make_interval(secs => greatest(claim_lease_seconds, 30)),
    updated_at = timezone('utc', now())
  where job.analysis_id = claim_analysis_id
    and job.status = 'running'
    and job.lease_owner = claim_worker_id
  returning job.*;
end;
$$;

create or replace function public.advance_analysis_job_stage(
  claim_analysis_id uuid,
  claim_worker_id text,
  next_stage text
)
returns setof public.analysis_jobs
language plpgsql
as $$
begin
  return query
  update public.analysis_jobs as job
  set
    stage = next_stage,
    updated_at = timezone('utc', now())
  where job.analysis_id = claim_analysis_id
    and job.status = 'running'
    and job.lease_owner = claim_worker_id
  returning job.*;
end;
$$;

create or replace function public.complete_analysis_job(
  claim_analysis_id uuid,
  claim_worker_id text
)
returns setof public.analysis_jobs
language plpgsql
as $$
begin
  return query
  update public.analysis_jobs as job
  set
    status = 'completed',
    stage = 'completed',
    lease_owner = null,
    lease_expires_at = null,
    last_heartbeat_at = timezone('utc', now()),
    last_error = null,
    completed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where job.analysis_id = claim_analysis_id
    and job.status = 'running'
    and job.lease_owner = claim_worker_id
  returning job.*;
end;
$$;

create or replace function public.fail_analysis_job(
  claim_analysis_id uuid,
  claim_worker_id text,
  failure_stage text,
  failure_error text,
  retry_delay_seconds integer default 30
)
returns setof public.analysis_jobs
language plpgsql
as $$
begin
  return query
  update public.analysis_jobs as job
  set
    status = case
      when job.attempt_count < job.max_attempts then 'queued'
      else 'failed'
    end,
    stage = case
      when job.attempt_count < job.max_attempts then failure_stage
      else 'failed'
    end,
    next_run_at = case
      when job.attempt_count < job.max_attempts
        then timezone('utc', now()) + make_interval(secs => greatest(retry_delay_seconds, 1))
      else timezone('utc', now())
    end,
    lease_owner = null,
    lease_expires_at = null,
    last_heartbeat_at = timezone('utc', now()),
    last_error = failure_error,
    completed_at = case
      when job.attempt_count < job.max_attempts then null
      else timezone('utc', now())
    end,
    updated_at = timezone('utc', now())
  where job.analysis_id = claim_analysis_id
    and job.status = 'running'
    and job.lease_owner = claim_worker_id
  returning job.*;
end;
$$;

create or replace function public.search_analysis_transcript_chunks(
  filter_analysis_id uuid,
  filter_user_id uuid,
  query_text text,
  match_count integer default 6,
  filter_start_seconds numeric default null,
  filter_end_seconds numeric default null
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
  with normalized_query as (
    select trim(coalesce(query_text, '')) as value
  ),
  search_query as (
    select
      case
        when value = '' then null
        else websearch_to_tsquery('simple', value)
      end as terms
    from normalized_query
  )
  select
    chunk.id,
    chunk.analysis_id,
    chunk.user_id,
    chunk.chunk_index,
    chunk.text,
    chunk.start_seconds,
    chunk.end_seconds,
    ts_rank_cd(to_tsvector('simple', chunk.text), search_query.terms) as score
  from public.analysis_transcript_chunks as chunk
  cross join search_query
  where chunk.analysis_id = filter_analysis_id
    and chunk.user_id = filter_user_id
    and (
      filter_start_seconds is null
      or coalesce(chunk.end_seconds, chunk.start_seconds, 0) >= filter_start_seconds
    )
    and (
      filter_end_seconds is null
      or coalesce(chunk.start_seconds, chunk.end_seconds, 0) <= filter_end_seconds
    )
    and search_query.terms is not null
    and search_query.terms @@ to_tsvector('simple', chunk.text)
  order by score desc, chunk.chunk_index asc
  limit greatest(match_count, 1);
$$;
