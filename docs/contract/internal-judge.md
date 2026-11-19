# Internal judge contract

Status: proposed for T43 review. Implementation scope here is the PostgreSQL queue and the worker with a test judge.

## Work and result

| Field | Type | Rule |
| --- | --- | --- |
| submissionId | UUID | Stable job identifier. At most one grading job per submission. |
| labId | UUID | Resolves the lab and its grading configuration. |
| code | string | Exact C++17 source stored by the submission endpoint. |
| leaseToken | UUID | New token on each claim. Used only to authorize a result write. |
| verdict | enum | AC, WA, TLE, MLE, RE or CE. A sandbox or infrastructure failure is not a student verdict. |
| tests | array | Consecutive one-based test numbers and run verdicts, in test order. Compilation failure has no test results. AC requires all reported tests to pass, and the grading adapter must report every configured test for an AC. |

For a run with failed tests, the overall verdict is the verdict of the first failed test in test order. A run with only passing tests has overall verdict AC. Compilation failure is CE and has an empty test list.

Test bundles and runtime limits come from the lab configuration in T46. Their storage and the sandbox adapter are outside this queue contract revision. The worker receives only the job data it needs. No application JWT secret, checker credential, database credential or other service secret is passed to an execution sandbox. Verdict responses must omit source, test input, expected output and internal diagnostics.

## Queue and recovery

1. A successful new submission inserts its grading job in the same database transaction. A replay never creates a second job. Existing submissions without grading jobs are enqueued by the migration using their original submission time.
2. A worker selects the oldest eligible job using `FOR UPDATE SKIP LOCKED`, sets a fresh lease token and commits the claim before calling the judge. Pending jobs and expired claims are eligible. When simultaneous jobs have the same submission time, submission ID breaks the tie.
3. A result write succeeds only while the caller holds the current, unexpired lease. The database checks the lease and samples the completion time after locking the job row. The worker stores the overall verdict and ordered per-test verdicts atomically with job completion. Repeated writes, stale tokens and finishes after expiry return false. Completed jobs cannot be reclaimed.
4. If the worker dies or the judge fails before completing the write, the record becomes eligible when its lease expires. Another worker can claim it under a new token. Set the lease longer than the grading execution deadline plus the result write budget when connecting the real judge.

The existing submission POST returns a receipt with status `queued` for both creation and replay. Student polling and SSE are separate contracts. An AC result can trigger the checker after T44 defines its input and idempotency rules.

## Observability handoff

The worker emits the submission ID, outcome and time in the grading adapter as key-value log fields. The queue timestamps support later end-to-end measurements from submission receipt to result commit. For T57, this query measures jobs ready to claim and jobs currently leased as separate counts.

```sql
select count(*) filter (
         where lease_expires_at is null or lease_expires_at <= statement_timestamp()
       ) as ready_jobs,
       count(*) filter (
         where lease_expires_at > statement_timestamp()
       ) as leased_jobs
from judge_jobs
where finished_at is null;
```
