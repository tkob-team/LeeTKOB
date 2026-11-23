-- PA#3 table boundaries. Ownership and write rules: docs/contract/pa3-boundaries.md.

-- Accounts. Legacy rows (and fixtures that insert only id) have no credentials yet,
-- so email and password_hash are nullable; unique still applies to non-null emails.
alter table users add column email text unique;
alter table users add column password_hash text;
alter table users add column display_name text;

-- Lab statement and limits. Wall time is 3 x cpu_time_ms (FAQ-05) and is not stored.
-- title is nullable so labs created before PA#3 remain valid.
alter table labs add column title text;
alter table labs add column statement_md text not null default '';
alter table labs add column cpu_time_ms integer not null default 1000
  check (cpu_time_ms between 1000 and 5000);
alter table labs add column memory_mb integer not null default 256
  check (memory_mb between 64 and 512);

create table lab_tests (
  lab_id uuid not null references labs (id) on delete cascade,
  ordinal integer not null check (ordinal >= 1),
  input text not null,
  expected_output text not null,
  primary key (lab_id, ordinal)
);

create table lab_constraints (
  lab_id uuid not null references labs (id) on delete cascade,
  code varchar(8) not null,
  ordinal integer not null check (ordinal >= 1),
  text text not null,
  deduction numeric(4, 2) not null check (deduction > 0 and deduction <= 10),
  primary key (lab_id, code)
);

-- Same lease shape as judge_jobs; a check job has no result column because
-- its outcome is the set of findings rows.
create table check_jobs (
  submission_id uuid primary key references submissions (id) on delete cascade,
  enqueued_at timestamptz not null,
  lease_token uuid,
  lease_expires_at timestamptz,
  finished_at timestamptz,
  check ((lease_token is null) = (lease_expires_at is null)),
  check (finished_at is null or lease_token is null)
);

create index check_jobs_pending_order_idx
  on check_jobs (enqueued_at, submission_id)
  where finished_at is null;

create table model_calls (
  id uuid primary key,
  submission_id uuid references submissions (id) on delete set null,
  provider_request_id text,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),
  outcome text not null,
  created_at timestamptz not null default now()
);

create table findings (
  submission_id uuid not null references submissions (id) on delete cascade,
  constraint_code varchar(8) not null,
  verdict text not null check (verdict in ('pass', 'violation', 'unsure')),
  source text not null check (source in ('hard_rule', 'model', 'guardrail')),
  -- [{"line": <int>, "text": <string>}, ...]
  evidence jsonb not null default '[]' check (jsonb_typeof(evidence) = 'array'),
  reason text not null default '',
  unsure_cause text
    check (unsure_cause in ('model', 'schema', 'timeout', 'evidence', 'cost_cap')),
  model_call_id uuid references model_calls (id),
  created_at timestamptz not null default now(),
  primary key (submission_id, constraint_code)
);
