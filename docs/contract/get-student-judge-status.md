# Student submission and polling

## GET /student/labs

Requires a registered student with a valid JWT. Returns an array of labs for the
student's current class memberships. Each entry contains `id`, `title` and
`latestSubmissionId`. The latest ID is null when the student has no on-time submission
for that lab. A legacy lab can have a null title. The response uses `Cache-Control: no-store`.

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


## Live updates

`GET /labs/{labId}/submissions/{submissionId}/events` uses the same Bearer authentication,
student role and ownership checks as the JSON endpoint. It returns `text/event-stream`,
`Cache-Control: no-store` and `X-Accel-Buffering: no`. Each `status` event contains a JSON
status snapshot. The opening event contains the current state, and later events carry
changes until the verdict is complete. Comment frames keep the connection alive.

A stream ends on completion, token expiry, lost access or after 20 seconds. The client
may fetch the existing JSON status and reconnect. The API returns 503 when all stream
slots are occupied.
