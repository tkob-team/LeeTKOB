ReviewQueueTable lists the pairs a TA must review before publishing.

- Consumer provides: rows of (submission id, constraint, deduction, source `hard rule` or `model`, verdict, evidence lines). Pseudonymous ids only; student names are not shown in the queue.
- Rows open the EvidenceBlock beside the table. Model `violation` rows have no bulk action; hard-rule rows may be accepted as a group.
- Wrap it in `lk-table-wrap` so it scrolls on narrow screens.
