-- psql variables: lab_id and manifest_json. Run after the dedicated lab drains.
with manifest as (
  select :'manifest_json'::jsonb as data, :'lab_id'::uuid as lab_id
), receipts as (
  select r.*
  from manifest m
  cross join lateral jsonb_to_recordset(m.data->'receipts')
    as r(submission_id uuid, student_id uuid, submitted_at timestamptz)
), matched as (
  select s.id, j.submission_id, j.finished_at, j.result, j.grading_ms
  from manifest m
  cross join receipts r
  left join submissions s on s.id = r.submission_id
    and s.lab_id = m.lab_id
    and s.student_id = r.student_id
    and s.submitted_at = r.submitted_at
  left join judge_jobs j on j.submission_id = s.id
), extras as (
  select count(*) as additional_submissions
  from manifest m
  join submissions s on s.lab_id = m.lab_id
  where not exists (select 1 from receipts r where r.submission_id = s.id)
)
select (select count(*) from receipts) as receipts,
       (select count(distinct submission_id) from receipts) as unique_receipts,
       (select count(distinct student_id) from receipts) as students,
       count(id) as matched_submissions,
       (select additional_submissions from extras) as additional_submissions,
       count(submission_id) as judge_jobs,
       count(*) filter (where finished_at is not null and result is not null) as verdicts,
       count(grading_ms) as grading_samples,
       round((percentile_cont(0.95) within group (order by grading_ms))::numeric, 1)
         as grading_p95_ms,
       coalesce((
         (select data->'passed' = 'true'::jsonb and data->'version' = '1'::jsonb
                 and data->>'lab_id' = lab_id::text from manifest)
         and (select count(*) = 80 and count(distinct submission_id) = 80
                     and count(distinct student_id) = 80 from receipts)
         and count(id) = 80
         and (select additional_submissions = 0 from extras)
         and count(*) filter (where finished_at is not null and result is not null) = 80
         and count(grading_ms) = 80
       ), false) as passed
from matched;
