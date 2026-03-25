-- Phase 1 schema for job-description ranking and cached analysis storage.
--
-- If your project installed pgvector in a specific schema, replace vector(384)
-- with public.vector(384) or extensions.vector(384) as needed.

create extension if not exists pgcrypto;
create extension if not exists vector;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  storage_path text,
  content_hash text not null unique,
  raw_text text not null,
  extracted_experience numeric(4,1),
  extracted_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_descriptions (
  id uuid primary key default gen_random_uuid(),
  job_hash text not null unique,
  raw_text text not null,
  required_experience numeric(4,1) not null default 0,
  parsed_requirements jsonb not null default '{}'::jsonb,
  must_have_keywords text[] not null default '{}',
  nice_to_have_keywords text[] not null default '{}',
  embedding vector(384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resume_chunks (
  id bigserial primary key,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  chunk_index integer not null,
  section_name text,
  chunk_text text not null,
  embedding vector(384),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (resume_id, chunk_index)
);

create table if not exists public.resume_job_analyses (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes(id) on delete cascade,
  job_id uuid not null references public.job_descriptions(id) on delete cascade,
  prompt_version text not null default 'phase1-v1',
  final_score numeric(5,2) not null,
  semantic_score numeric(5,2) not null default 0,
  keyword_score numeric(5,2) not null default 0,
  experience_score numeric(5,2) not null default 0,
  bucket text not null check (bucket in ('high', 'medium', 'low')),
  matched_items jsonb not null default '[]'::jsonb,
  missing_items jsonb not null default '[]'::jsonb,
  improvement_points jsonb not null default '[]'::jsonb,
  llm_model text,
  llm_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resume_id, job_id, prompt_version)
);

create index if not exists resumes_content_hash_idx
  on public.resumes (content_hash);

create index if not exists resume_chunks_resume_id_idx
  on public.resume_chunks (resume_id);

create index if not exists resume_job_analyses_job_bucket_score_idx
  on public.resume_job_analyses (job_id, bucket, final_score desc);

drop trigger if exists resumes_set_updated_at on public.resumes;
create trigger resumes_set_updated_at
before update on public.resumes
for each row execute function public.set_updated_at();

drop trigger if exists job_descriptions_set_updated_at on public.job_descriptions;
create trigger job_descriptions_set_updated_at
before update on public.job_descriptions
for each row execute function public.set_updated_at();

drop trigger if exists resume_job_analyses_set_updated_at on public.resume_job_analyses;
create trigger resume_job_analyses_set_updated_at
before update on public.resume_job_analyses
for each row execute function public.set_updated_at();
