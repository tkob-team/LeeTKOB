ReviewQueueTable lists the pairs a TA must review before publishing.

- Consumer provides: rows of (submission id, constraint, deduction, source `hard rule`, `model` or `guardrail` (a limit such as a timeout produced the verdict), verdict, evidence lines, and for `unsure` its cause, shown under the badge). Pseudonymous ids only; student names are not shown in the queue.
- Rows open the EvidenceBlock beside the table. Model `violation` rows have no bulk action; hard-rule rows may be accepted as a group.
- The constraint text wraps in full (never clipped) and renders inline code; the other columns keep their width, so Khoản trừ, Nguồn and Kết luận stay in view.
- Deduction: `−N` only for `violation` and `unsure`; a `pass` row reads "0 (−N nếu vi phạm)" (`deductionLabel`). Evidence reads "dòng 11" or "dòng 9, 10" (`evidenceLabel`).
- `showSubmission={false}` drops the Bài nộp column when the table sits under a block header that names the submission (the review queue groups rows by submission, with the detail panel in a sticky column beside the blocks).
- Wrap it in `lk-table-wrap` so it scrolls on narrow screens.
