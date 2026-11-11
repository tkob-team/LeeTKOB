# PA#02 evidence

Team: `23120255-23120262-23120264`. Review completion was confirmed by Hoang on
2026-11-10; this records the team's reported review, not GitHub Review events.

| Required link | Evidence |
| --- | --- |
| Public repository | [tkob-team/LeeTKOB](https://github.com/tkob-team/LeeTKOB) |
| Main branch protection | [Target and empty bypass list](docs/pa2/branch-protection.png), [five required checks](docs/pa2/branch-protection-2-required-checks.png), [ruleset record](docs/pa2/branch-protection.md) |
| Red PR blocked from merging | [Follow-up PR #13](https://github.com/tkob-team/LeeTKOB/pull/13), [red run 42809598818](https://github.com/tkob-team/LeeTKOB/actions/runs/42809598818), test-only baseline `4ddd760`: 5 assertion failures, 0 setup errors; four other checks passed |
| Green implementation commit/run | [Implementation fix 8db9096](https://github.com/tkob-team/LeeTKOB/commit/8db9096), [5/5 green run 42810474162](https://github.com/tkob-team/LeeTKOB/actions/runs/42810474162). The regression-test file is unchanged between the red and green commits |
| Run for the pushed pa2 tag | [pa2 tag CI run 42819680913](https://github.com/tkob-team/LeeTKOB/actions/runs/42819680913), [tagged source 236fa35](https://github.com/tkob-team/LeeTKOB/tree/pa2) |
| Code-only deliberate contract break | [T13 PR #10 — DO NOT MERGE](https://github.com/tkob-team/LeeTKOB/pull/10), [red run](https://github.com/tkob-team/LeeTKOB/actions/runs/42779970787), [disabled merge screenshot](docs/pa2/t13-blocked.png) |

See the [organized evidence directory](docs/pa2/README.md) for task records, review history and raw logs.

Additional evidence:

- [PR template automatically populated in the new-PR form](docs/pa2/pr-template-autofill.png).
- [T05 local environment and exact make-command logs](docs/pa2/logs/t05/results.json).
- [Permission coverage and reproducible command matrix](docs/pa2/agent-permissions.md).
- [Contract](docs/contract/post-labs-submissions.md), [contract tests](backend/src/test/java/com/leetkob/backend/submission/SubmissionContractTest.java), [AI-LOG](AI-LOG.md).
- [PostgreSQL queue decision, T27](docs/decisions/0001-postgresql-judge-queue.md).
- Original T11: [PR #8](https://github.com/tkob-team/LeeTKOB/pull/8), [setup-error red run](https://github.com/tkob-team/LeeTKOB/actions/runs/42767919398), [green implementation run](https://github.com/tkob-team/LeeTKOB/actions/runs/42768403506).

## Release evidence and remaining submission

1. Reviewed follow-ups merged through [PR #13](https://github.com/tkob-team/LeeTKOB/pull/13) at `236fa35`; main CI [42819474226](https://github.com/tkob-team/LeeTKOB/actions/runs/42819474226) passed all five checks. Keep PR #10 unmerged.
2. T12 account setup now uses the user's chosen Free-tier-only policy: key created,
   no billing configured. See [evidence and the distinction from a dollar cap](docs/pa2/t12-free-tier.md).
3. T04/T14 shared-workstation verification is complete: [fresh-clone evidence](docs/pa2/t14-fresh-clone.md). Hoang confirmed all three developers use this machine.
4. Tag `pa2` points to verified PA02 source `236fa35`. Its CI link is above. This evidence-index update is a subsequent documentation change; it does not move the tag or claim that later W4 features are part of PA02.
5. Include `.git`, this file, `AI-LOG.md` and `SELF_ASSESSMENT_REPORT.md` at the
   archive root. Keep self-assessment out of the public repository. Name the archive
   `23120255-23120262-23120264_<n>.zip`, verify its source matches the tag, then
   submit using the student account and retain confirmation.

All six evidence links are populated. Archive preparation and submission remain T21; neither is claimed by the completed evidence index. For an archive of the tagged source, retain this subsequent evidence index separately and document any included metadata overlay explicitly.
