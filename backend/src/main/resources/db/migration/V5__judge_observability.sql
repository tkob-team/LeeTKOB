alter table judge_jobs
  add column first_claimed_at timestamptz,
  add column grading_ms bigint check (grading_ms >= 0);

create index judge_jobs_recent_enqueue_idx on judge_jobs (enqueued_at);
create index judge_jobs_recent_finish_idx on judge_jobs (finished_at)
  where finished_at is not null;

create table judge_infrastructure_failures (
  id uuid primary key,
  submission_id uuid not null references submissions (id) on delete cascade,
  occurred_at timestamptz not null default statement_timestamp()
);
create index judge_infrastructure_failures_recent_idx
  on judge_infrastructure_failures (occurred_at);

create table checker_model_attempts (
  call_id uuid not null,
  attempt integer not null check (attempt > 0),
  submission_id uuid not null references submissions (id) on delete cascade,
  model text not null,
  outcome text not null,
  latency_ms bigint not null check (latency_ms >= 0),
  estimated_cost_usd numeric(14, 6) check (estimated_cost_usd >= 0),
  occurred_at timestamptz not null default statement_timestamp(),
  primary key (call_id, attempt)
);
create index checker_model_attempts_recent_idx on checker_model_attempts (occurred_at);
