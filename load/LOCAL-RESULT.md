# T102 local sandbox verification

| Field | Observed result |
| --- | --- |
| Start | 27 Nov 2026, 15:06:49 ICT |
| Environment | Local PostgreSQL, API, sandbox proxy, judge worker and synthetic class |
| Synthetic students | 80 |
| Valid HTTP 201 receipts | 80 of 80 |
| Last request start | 9006.6 ms after workload start |
| Server receipt timestamp span | 8982 ms |
| API receipt p95 | 50.0 ms |
| Unique students / submissions / judge jobs | 80 / 80 / 80 |
| Terminal verdicts / grading samples | 80 / 80 |
| Grading p95 | 1975.2 ms |
| Reconciliation | PASS |

The local driver used 80 accounts created by the load seed. The p95 grading value
excludes queue wait. The reconciliation ran after the local judge queue drained.
The deployed run and its separate RESULT.md remain for VM verification.


## Receipt manifest verification

A fresh Compose run on 27 Nov 2026 at 15:31:03 ICT produced 80 distinct receipts.
The server receipt timestamp span was 9001 ms and API receipt p95 was 29.9 ms.
After the queue drained, the audit matched all 80 receipt IDs, students and timestamps
to 80 finished jobs. There were no extra submissions. Grading p95 was 783.7 ms.

The same audit returned false while jobs were still running. After one receipt ID was
replaced in a copy of the manifest, it returned false with 79 matches and one extra
submission. These are local verification results.
