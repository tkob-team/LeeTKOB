# PA#3 data boundaries — 1.0.0

Schema: `backend/src/main/resources/db/migration/V4__pa3_boundaries.sql`.
Test: `backend/src/test/java/com/leetkob/backend/Pa3BoundariesMigrationTest.java`.
Each table has one writer flow. Other flows read it and never write it.

| Table / columns | Writer | Readers |
| --- | --- | --- |
| `users.email`, `password_hash`, `display_name` | Accounts (registration, login) | All flows (display name only; never the hash) |
| `labs.title`, `statement_md`, `cpu_time_ms`, `memory_mb` | Lab authoring (TA) | Judge, checker, student UI |
| `lab_tests` | Lab authoring (TA) | Judge only; never returned to students |
| `lab_constraints` (incl. `deduction`) | Lab authoring (TA) | Checker, grading, UI |
| `judge_jobs` | Judge (Hoà) | Submission status |
| `check_jobs` | Judge enqueues; checker claims and finishes | Submission status |
| `findings` | Checker | Grading, student and TA UI |
| `model_calls` | Checker (model adapter) | Cost and observability reports |

## Rules

1. Limits: CPU time 1000–5000 ms (default 1000), memory 64–512 MB (default 256).
   Wall time is 3 × CPU time (FAQ-05) and is computed, not stored.
2. The judge (Hoà) inserts the `check_jobs` row in the same transaction that stores an
   AC result in `judge_jobs`. A non-AC result creates no check job. Claims use the same
   lease rules as `judge_jobs` (see `internal-judge.md`).
3. A finding is written once per (`submission_id`, `constraint_code`):
   `insert ... on conflict do nothing`. A finding is never updated or replaced; a retried
   check job that loses the race keeps the first row.
4. The model never writes a deduction. `findings` has no deduction column; the
   deduction comes only from `lab_constraints.deduction`, written by a TA. Model output
   only sets `verdict`, `evidence` and `reason` through the checker.
5. `findings.evidence` is a JSON array of `{"line": <int>, "text": <string>}`.
   `unsure_cause` is null or one of `model`, `schema`, `timeout`, `evidence`, `cost_cap`.
6. `model_calls` stores provider metadata, token counts, latency and cost, never the
   prompt, the student code or an API key.
7. `spring.flyway.out-of-order=true` lets the three flows merge their own `V5+`
   migrations in any order; a migration never edits a table owned by another flow.

## Changelog

| Version | Change |
| --- | --- |
| 1.0.0 | Initial boundaries for PA#3. |
