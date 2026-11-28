# Internal judge contract

The HTTP API enqueues work. The separate judge worker polls PostgreSQL and runs
the Docker grading adapter.

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

The worker reads `lab_tests` by ordinal and uses the runtime limits from
`labs`. It compiles once with `g++ -std=c++17 -O2` in a sandbox and starts a
fresh sandbox for each test. A lab without tests leaves the job available
for retry. The judge compares stdout to expected output token by token.
Only the program and that test's input enter a run sandbox. The expected
output stays with the worker. Verdict responses omit all grading data
except the overall and per-test verdicts.

Compilation has a 10 second deadline. Each run has its lab's CPU and
memory limits, a wall deadline of three times the CPU limit, no swap,
one MiB of combined stdout and stderr, and at most 16 tasks in its cgroup
including the supervisor. The sandbox runs without a network, root
privileges, bind mounts, socket access or service environment variables.
CPU and wall exhaustion give TLE. A cgroup OOM kill gives MLE.
Too much output or a failed program gives RE. The compiler's bounded
failure gives CE. Infrastructure failures leave the job eligible for retry.

## Queue and recovery

1. A successful new submission inserts its grading job in the same database transaction. A replay never creates a second job. Existing submissions without grading jobs are enqueued by the migration using their original submission time.
2. A worker selects the oldest eligible job using `FOR UPDATE SKIP LOCKED`, sets a fresh lease token and commits the claim before calling the judge. Pending jobs and expired claims are eligible. When simultaneous jobs have the same submission time, submission ID breaks the tie.
3. A result write succeeds only while the caller holds the current, unexpired lease. The database checks the lease and samples the completion time after locking the job row. The worker stores the overall verdict and ordered per-test verdicts atomically with job completion. Repeated writes, stale tokens and finishes after expiry return false. Completed jobs cannot be reclaimed.
4. If the worker dies or the judge fails before completing the write, the record becomes eligible when its lease expires. The Docker adapter renews its 60 second lease before compilation and before each test. A renewal after expiry or from a stale token is rejected. Only the worker with the live lease may commit a result, even if a lost attempt had started grading.

The submission POST returns a receipt with status `queued` for both creation and replay. A successful AC completion also inserts one `check_jobs` row in the same database statement as the verdict. A non-AC result leaves `check_jobs` untouched. If the enqueue fails, neither change is committed. See [PA3 data boundaries](pa3-boundaries.md) for ownership.

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

## Sandbox proxy

The deployment worker uses a dedicated proxy on a private Compose network. Only the
proxy mounts the daemon socket. It owns compile and run settings, rejects unsupported
operations and reports an infrastructure failure if the operation cannot complete.

The deployed worker checks proxy readiness before taking work. Readiness requires the
configured sandbox image to be present on the daemon. After readiness or grading
fails, the worker waits five seconds before probing again. The lease still protects
any job already in progress when the dependency fails.
