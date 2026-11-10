# Reviewed PA#02 follow-ups

Update: T12 account provisioning was subsequently completed with a dedicated
LeeTKOB key on the user's explicit Free-tier-only choice. Billing is not set up;
no dollar cap was configured. See [current T12 evidence](t12-free-tier.md).
The earlier pending-T12 statement below records the pre-provisioning review.

Hoang confirmed on 2026-11-10 that the team's items had been reviewed and asked
for the remaining corrections. This records that confirmation; it does not create
GitHub Review events or imply that another person's local machine was exercised.

The changes are in [PR #13](https://github.com/tkob-team/LeeTKOB/pull/13), based on
the existing T19 summary from [PR #12](https://github.com/tkob-team/LeeTKOB/pull/12).
They are not on `main` until PR #13 is merged. PR #10 remains deliberately broken
and must never be merged.

| Task | Follow-up |
| --- | --- |
| T01/T02/T05 | Publish the original T05 command/environment logs, link real PR/CI results and clarify setup in README |
| T03/T13 | Add a screenshot of PR #10 showing the required failing test and disabled merge button; link the ruleset evidence |
| T06/T07 | Correct runtime-enforcement claims; cover common Git option/refspec variants and provide 19 safe executable-rule checks |
| T08 | Verify the new-PR form populates all three template questions; retain the screenshot |
| T09/T11 | Capture full-precision receipt time before application processing; preserve its millisecond form in responses; require JWT exp with zero expiry grace; remove the unnecessary code-hash assumption |
| T10 | Record that PR #7 was merged, and retain the fact that the blind reader was AI |
| T15 | Add two rules traced to existing T01/T07 incident records and their commit hashes |
| T16 | Prepare PA2.md, with an explicit pending tag-CI link rather than inventing one |
| T17/T18/T19 | Record the review confirmation and actual authorship; add this follow-up and clickable evidence links |
| T27 | Publish the accepted PostgreSQL queue decision; no worker implementation is claimed |

## Validation

The five new tests failed locally on status assertions before the implementation
fix (5 failures, 0 setup errors). After the fix, all 37 contract tests passed.
The assertions were not weakened to obtain green.

| Local command | Exit code | Seconds |
| --- | --- | --- |
| make lint | 0 | 4.39 |
| make format-check | 0 | 1.09 |
| make typecheck | 0 | 5.62 |
| make test | 0 | 12.75 |

These exact Makefile targets ran on native macOS arm64 with JDK 25 at
2026-11-10 18:41–18:42 UTC+07:00 against the working tree containing the fixes.
This is not a fresh clone on Hoa's machine. CI for the final PR commit is the
reproducible verification of the committed source.

The first remote test commit also needed a formatting correction. Commit
`4ddd760` contains the formatted regression tests before the implementation fix;
[run 42809598818](https://github.com/tkob-team/LeeTKOB/actions/runs/42809598818)
is the behavioral red baseline: 37 contract tests, 5 assertion failures and 0
errors; the other four required jobs passed and the PR was blocked. Implementation
commit [8db9096](https://github.com/tkob-team/LeeTKOB/commit/8db9096) then passed
[all five jobs](https://github.com/tkob-team/LeeTKOB/actions/runs/42810474162),
including 37 contract tests and the context-load test. The test file is unchanged
between `4ddd760` and `8db9096`. Final PR-head CI remains visible on PR #13.

Run `python3 scripts/check-agent-permissions.py` to repeat the 19 command-decision
checks without executing the supplied commands. Interactive agent enforcement
on each developer's machine remains outside what this script proves.

## Remaining work

- T12: Hoang explicitly confirmed that no model key or project spending cap has
  been set. README retains the proposed USD 20/month value and incomplete status.
- T04/T14: a run by/on Hoa's environment is still needed. The original and follow-up
  macOS logs belong to Hoang's environment.
- T10: the prior AI blind-read is retained as such; no human session is invented.
- T20/T21: the final release tag, tag CI, archive and submission confirmation are
  separate unfinished tasks. PA2.md has a release checklist.
- T22–T26 and T28–T41 keep their existing scope/status. This follow-up does not
  implement sandbox, model trials, FAQ duty, login, frontend or grading workers.

## Shared workstation clarification

T04/T14 are now verified on the shared team workstation, as authorized by Hoang. See [fresh-clone evidence](t14-fresh-clone.md); the earlier separate-machine condition is superseded.
