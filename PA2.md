# PA#02 evidence

Team: `23120255-23120262-23120264`. Review completion was confirmed by Hoang on
2026-11-10; this records the team's reported review, not GitHub Review events.

| Required link | Evidence |
| --- | --- |
| Public repository | [tkob-team/LeeTKOB](https://github.com/tkob-team/LeeTKOB) |
| Main branch protection | [Target and empty bypass list](docs/pa2/branch-protection.png), [five required checks](docs/pa2/branch-protection-2-required-checks.png), [ruleset record](docs/pa2/branch-protection.md) |
| Red PR blocked from merging | [Follow-up PR #13](https://github.com/tkob-team/LeeTKOB/pull/13), [red run 42809598818](https://github.com/tkob-team/LeeTKOB/actions/runs/42809598818), test-only baseline `4ddd760`: 5 assertion failures, 0 setup errors; four other checks passed |
| Green implementation commit/run | [Implementation fix 8db9096](https://github.com/tkob-team/LeeTKOB/commit/8db9096), [5/5 green run 42810474162](https://github.com/tkob-team/LeeTKOB/actions/runs/42810474162). The regression-test file is unchanged between the red and green commits |
| Run for the pushed pa2 tag | [CI runs for tag pa2](https://github.com/tkob-team/LeeTKOB/actions?query=branch%3Apa2) |
| Code-only deliberate contract break | [T13 PR #10 — DO NOT MERGE](https://github.com/tkob-team/LeeTKOB/pull/10), [red run](https://github.com/tkob-team/LeeTKOB/actions/runs/42779970787), [disabled merge screenshot](docs/pa2/t13-blocked.png) |

Additional evidence:

- [PR template automatically populated in the new-PR form](docs/pa2/pr-template-autofill.png).
- [T05 local environment and exact make-command logs](docs/pa2/logs/t05/results.json).
- [Permission coverage and reproducible command matrix](docs/pa2/agent-permissions.md).
- [Contract](docs/contract/post-labs-submissions.md), [contract tests](backend/src/test/java/com/leetkob/backend/submission/SubmissionContractTest.java), [AI-LOG](AI-LOG.md).
- [PostgreSQL queue decision, T27](docs/decisions/0001-postgresql-judge-queue.md).
- [T12 Free-tier key evidence](docs/pa2/t12-free-tier.md), [T14 fresh-clone evidence](docs/pa2/t14-fresh-clone.md).
- Original T11: [PR #8](https://github.com/tkob-team/LeeTKOB/pull/8), [setup-error red run](https://github.com/tkob-team/LeeTKOB/actions/runs/42767919398), [green implementation run](https://github.com/tkob-team/LeeTKOB/actions/runs/42768403506).

## Release

- Tag `pa2` is the commit that contains this file.
- The submission zip is built from that tag.
- `SELF_ASSESSMENT_REPORT.md` is in the zip, not in the repository.
