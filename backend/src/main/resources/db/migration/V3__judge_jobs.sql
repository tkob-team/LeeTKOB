create table judge_jobs (
  submission_id uuid primary key references submissions (id) on delete cascade,
  enqueued_at timestamptz not null,
  lease_token uuid,
  lease_expires_at timestamptz,
  result jsonb,
  finished_at timestamptz,
  check ((lease_token is null) = (lease_expires_at is null)),
  check ((result is null) = (finished_at is null)),
  check (finished_at is null or lease_token is null)
);

create index judge_jobs_pending_order_idx
  on judge_jobs (enqueued_at, submission_id)
  where finished_at is null;

insert into judge_jobs (submission_id, enqueued_at)
select id, submitted_at from submissions;
