# PA#02 evidence

Team: `23120255-23120262-23120264`. Review completion was confirmed by Hoang on
2026-11-10; this records the team's reported review, not GitHub Review events.

| Required link | Evidence |
| --- | --- |
| Public repository | [tkob-team/LeeTKOB](https://github.com/tkob-team/LeeTKOB) |
| Main branch protection | [Target and empty bypass list](docs/pa2/branch-protection.png), [five required checks](docs/pa2/branch-protection-2-required-checks.png), [ruleset record](docs/pa2/branch-protection.md) |
| Red PR blocked from merging | [Follow-up PR #13](https://github.com/tkob-team/LeeTKOB/pull/13), [red run 42809598818](https://github.com/tkob-team/LeeTKOB/actions/runs/42809598818), test-only baseline `4ddd760`: 5 assertion failures, 0 setup errors; four other checks passed |
| Green implementation commit/run | [Implementation fix 8db9096](https://github.com/tkob-team/LeeTKOB/commit/8db9096), [5/5 green run 42810474162](https://github.com/tkob-team/LeeTKOB/actions/runs/42810474162). The regression-test file is unchanged between the red and green commits |
| Run for the pushed pa2 tag | **Pending T20.** No tag run exists yet; replace this cell with the actual run after the final source is tagged |
| Code-only deliberate contract break | [T13 PR #10 — DO NOT MERGE](https://github.com/tkob-team/LeeTKOB/pull/10), [red run](https://github.com/tkob-team/LeeTKOB/actions/runs/42779970787), [disabled merge screenshot](docs/pa2/t13-blocked.png) |

Additional evidence:

- [PR template automatically populated in the new-PR form](docs/pa2/pr-template-autofill.png).
- [T05 local environment and exact make-command logs](docs/pa2/logs/t05/results.json).
- [Permission coverage and reproducible command matrix](docs/pa2/agent-permissions.md).
- [Contract](docs/contract/post-labs-submissions.md), [contract tests](backend/src/test/java/com/leetkob/backend/submission/SubmissionContractTest.java), [AI-LOG](AI-LOG.md).
- [PostgreSQL queue decision, T27](docs/decisions/0001-postgresql-judge-queue.md).
- Original T11: [PR #8](https://github.com/tkob-team/LeeTKOB/pull/8), [setup-error red run](https://github.com/tkob-team/LeeTKOB/actions/runs/42767919398), [green implementation run](https://github.com/tkob-team/LeeTKOB/actions/runs/42768403506).

## Release checks still required

1. Merge the reviewed follow-up only after its five checks pass; keep PR #10 unmerged.
2. T12 account setup now uses the user's chosen Free-tier-only policy: key created,
   no billing configured. See [evidence and the distinction from a dollar cap](docs/pa2/t12-free-tier.md).
3. Complete each developer's own environment/fresh-clone evidence (T04/T14);
   Hoang's macOS run does not establish a run on Hoa's machine.
4. Create and push `pa2` for the final commit, wait for tag CI and insert its link above.
5. Include `.git`, this file, `AI-LOG.md` and `SELF_ASSESSMENT_REPORT.md` at the
   archive root. Keep self-assessment out of the public repository. Name the archive
   `23120255-23120262-23120264_<n>.zip`, verify its source matches the tag, then
   submit using the student account and retain confirmation.

This file prepares the evidence index; the pending tag, account and submission
steps are not marked complete by its presence.
