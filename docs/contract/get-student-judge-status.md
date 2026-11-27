# Student submission and polling

Status: 1.1.0 (PA#03). Owner of this flow: Hoà. Fields are only added in 1.1.0; no existing field
changes meaning.

## GET /student/labs

Requires a registered student with a valid JWT. Returns an array of labs for the
student's current class memberships, newest `opensAt` first. Labs of classes the student is not a
current member of are never listed. The response uses `Cache-Control: no-store`.

| Field | Meaning |
| --- | --- |
| `id` | Lab UUID |
| `title` | Lab title; a legacy lab can have a null title. |
| `latestSubmissionId` | The student's latest submission received before the deadline (the counted one, FAQ-02); null when there is none. |
| `opensAt`, `dueAt` | RFC 3339 UTC with milliseconds (`2026-12-01T16:59:59.000Z`). Present also for a lab that has not opened yet. *(1.1.0)* |
| `latestVerdict` | Test verdict of `latestSubmissionId` (AC, WA, TLE, MLE, RE, CE); null when there is no submission or it is still queued or grading. *(1.1.0)* |

The list never includes the statement, tests, findings or deductions. A lab that has not opened
yet shows its times only; its statement stays behind `GET /labs/{labId}` (409 `lab-not-open`,
[lab authoring](lab-authoring.md)).

## GET /labs/{labId}/submissions/{submissionId}

Requires the student who owns the submission and is still a member of the lab's
class. A missing submission, mismatched lab or inaccessible submission returns
404 `submission-not-found`. An invalid UUID returns 400 `invalid-request`.
Unauthorized roles get 403 and unauthenticated requests get 401.

The response uses `Cache-Control: no-store` and contains:

| Field | Meaning |
| --- | --- |
| `id` | Submission UUID |
| `status` | `queued` until claimed, `grading` with a live lease, `completed` once a result is stored. An expired claim is queued again. |
| `counted` | True for the latest submission received before the deadline for that lab and student, independent of its verdict. Equal receipt timestamps are ordered by submission ID. |
| `verdict` | Null while queued or grading. Otherwise AC, WA, TLE, MLE, RE or CE. |
| `tests` | Ordered `{number, verdict}` objects. Empty before completion or on CE. |

The response omits source, test input and output, diagnostics, checker findings
and deductions. A later on-time WA is counted even if an earlier attempt was AC.
The judge hands off successful AC results as specified in
[PA3 data boundaries](pa3-boundaries.md). The submission POST and its replay
behavior remain defined in [the intake contract](post-labs-submissions.md).

## Changelog

| Version | Change |
| --- | --- |
| 1.0.0 | `GET /student/labs` with `id`, `title`, `latestSubmissionId`; student polling. |
| 1.1.0 | `GET /student/labs` adds `opensAt`, `dueAt` and `latestVerdict` for the student lab table. Added fields only. Requested after the PA#3 UI audit (27/11); to be reviewed by Hoà, who owns this flow. |

## Contract tests

`backend/src/test/java/com/leetkob/backend/submission/SubmissionStatusContractTest.java`:

| Test | Rule |
| --- | --- |
| `labPickerOnlyListsMembershipAndRemembersLatestSubmission` | Membership only; `latestSubmissionId`; no tests. |
| `labListCarriesTimesAndTheLatestVerdict` | `opensAt`/`dueAt` format; `latestVerdict` null while queued or grading, then the verdict of the latest on-time submission (not an earlier AC); no statement or findings. |
| `labNotOpenYetListsItsTimesButNotItsStatement` | A lab not open yet is listed with its times and no statement; `GET /labs/{labId}` still answers 409 `lab-not-open`. |
| `studentOfAnotherClassDoesNotSeeTheLab` | A student of another class sees only their own class's labs. |
| `latestCountsEvenWhenAnEarlierSubmissionWasAccepted` | Polling: counted rule and omitted fields. |
| `strangersAndWrongLabsDoNotRevealSubmissions` | Polling: 404, 403, 401. |
