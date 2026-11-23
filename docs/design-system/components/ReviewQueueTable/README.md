ReviewQueueTable lists the pairs a TA must review before publishing.

- Consumer provides: rows of (submission id, constraint, deduction, source `hard rule`, `model` or `guardrail` (a limit such as a timeout produced the verdict), verdict, evidence lines, and for `unsure` its cause, shown under the badge). Pseudonymous ids only; student names are not shown in the queue.
- Rows open the EvidenceBlock beside the table. Model `violation` rows have no bulk action; hard-rule rows may be accepted as a group.
- Wrap it in `lk-table-wrap` so it scrolls on narrow screens.
