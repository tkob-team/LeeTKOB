# Contract: `POST /labs/{labId}/submissions`

Status: 1.0.2 (PA#02). Source of truth for this endpoint: code and tests must follow this file, not the other way round. Product rules come from the FAQ (FAQ-01, FAQ-02, FAQ-03, FAQ-05) and the team decisions (Bearer JWT HS256, `Idempotency-Key` stored in the database).

A student submits C++ source code to a lab of a class they belong to. Sending the same request again with the same `Idempotency-Key` never creates a second submission.

## 1. Who may call it

| Caller | Result |
| --- | --- |
| No token, malformed token, bad signature, `alg` other than HS256, expired token, or missing `sub` / `role` / `exp` claim | 401 `unauthenticated` |
| Valid token with role `ADMIN` or `TA` | 403 `forbidden-role` (only students submit) |
| Valid `STUDENT` who is **not** a member of the lab's class | 404 `lab-not-found` (same answer as an unknown lab, so lab IDs cannot be probed) |
| Valid `STUDENT` who is a member of the lab's class | Allowed (continue with the rules below) |

Authentication: `Authorization: Bearer <JWT>`, HS256. Claims used: `sub` (user ID, UUID), `role` (`ADMIN`, `TA` or `STUDENT`), `exp`. The student is always the token's `sub`; the request cannot name another student. Class membership is read from the database on every request, never from the token.

A student can only ever create or see their own submissions (FAQ-01).

## 2. Request

```
POST /labs/{labId}/submissions
Authorization: Bearer <JWT>
Idempotency-Key: <client-generated UUID v4>
Content-Type: application/json

{ "code": "#include <iostream>\nint main() { std::cout << 1; }\n" }
```

| Part | Rule |
| --- | --- |
| `labId` (path) | UUID. Any other value is 400 `invalid-request`. |
| `Authorization` header | Required, see section 1. |
| `Idempotency-Key` header | Required. 16 to 64 characters from `A-Z a-z 0-9 _ -` (a UUID v4 is recommended). Missing: 400 `idempotency-key-required`. Wrong format: 400 `invalid-request`. |
| `Content-Type` | Must be `application/json`, otherwise 415 `unsupported-media-type`. |
| `code` (body) | Required string, C++17 source, compiled by the judge with `g++ -std=c++17 -O2`. Not blank (at least one non-whitespace character). At most 65,536 bytes in UTF-8 (64 KB, FAQ-05): larger is 413 `code-too-large`. |
| Other body fields | Not allowed. Unknown fields are 400 `invalid-request`. The body must be a single JSON object. |

An oversized submission is rejected and does not count as a submission (FAQ-05).

## 3. Rules and order of checks

The first failing step decides the response:

1. Authentication (401).
2. Role (403).
3. Content type (415).
4. `Idempotency-Key` present (400) and well-formed (400).
5. `labId` is a UUID and the lab exists in a class the student belongs to (400 / 404).
6. Body is valid JSON with a valid `code` (400 / 413).
7. Idempotency lookup, see section 5 (replay 200, or 422).
8. Lab is open for submissions: `now >= opens_at` (else 409 `lab-not-open`) and `now < due_at` (else 409 `lab-closed`).
9. Create the submission (201).

Time rules (FAQ-03): `now` is captured in UTC at the first application request filter, before authentication, database access and body processing. This instant is kept for the whole request; processing latency cannot turn an on-time request into a late one or a request before opening into an accepted one. Deadline comparisons retain the full captured precision; only the stored/returned `submittedAt` is truncated to milliseconds. A request received before `due_at` stays valid even if it waits in the grading queue. A submission at exactly `due_at` is late.

A student may submit as many times as they like before the deadline (FAQ-02). Each new `Idempotency-Key` creates a new submission. Which one counts for the grade is decided elsewhere and is not part of this contract.

## 4. Responses

### 201 Created (first time this key is used)

```
Content-Type: application/json

{
  "id": "0b7e5a52-2a45-4c53-8d49-4b8a3a5cfb10",
  "labId": "8f2d1c34-5e6a-4f7b-9c10-1a2b3c4d5e6f",
  "studentId": "c1d2e3f4-0a1b-4c2d-8e3f-9a0b1c2d3e4f",
  "status": "queued",
  "submittedAt": "2026-11-10T03:15:42.120Z",
  "sizeBytes": 51
}
```

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string (UUID) | New submission ID. |
| `labId` | string (UUID) | Same as the path. |
| `studentId` | string (UUID) | The token's `sub`. |
| `status` | string | Always `queued` for this endpoint. Other values are added by grading features later. |
| `submittedAt` | string | RFC 3339 UTC time the server received the request, millisecond precision. |
| `sizeBytes` | integer | Size of `code` in UTF-8 bytes. |

The response never includes the source code, test data, or verdicts.

### 200 OK (replay of an earlier request)

Same body as the original 201, byte for byte in content, plus the header `Idempotency-Replayed: true`. See section 5.

### Errors (RFC 9457)

Every error is `application/problem+json` with `type`, `title`, `status`, `detail` and `instance` (the request path). Validation errors add `errors`, a list of `{ "field": "...", "detail": "..." }`. `detail` is for humans and may change; clients must branch on `type`. 401 also sends `WWW-Authenticate: Bearer`.

| `type` | Status | When |
| --- | --- | --- |
| `urn:leetkob:problem:idempotency-key-required` | 400 | `Idempotency-Key` header missing. |
| `urn:leetkob:problem:invalid-request` | 400 | Bad `labId`, bad `Idempotency-Key` format, invalid JSON, missing or blank `code`, wrong type, unknown field. |
| `urn:leetkob:problem:unauthenticated` | 401 | Section 1, first row. |
| `urn:leetkob:problem:forbidden-role` | 403 | Token role is `ADMIN` or `TA`. |
| `urn:leetkob:problem:lab-not-found` | 404 | Unknown lab, or a lab in a class the student is not in. |
| `urn:leetkob:problem:method-not-allowed` | 405 | Other HTTP methods on this path (also sends `Allow: POST`). |
| `urn:leetkob:problem:lab-not-open` | 409 | `now < opens_at`. |
| `urn:leetkob:problem:lab-closed` | 409 | `now >= due_at`. |
| `urn:leetkob:problem:code-too-large` | 413 | `code` is over 65,536 bytes. |
| `urn:leetkob:problem:unsupported-media-type` | 415 | `Content-Type` is not `application/json`. |
| `urn:leetkob:problem:idempotency-key-reused` | 422 | Same key already used by this student with a different `labId` or different `code`. |
| `urn:leetkob:problem:internal-error` | 500 | Unexpected failure. No stack trace, SQL or class names in the response. |

Example:

```
HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{
  "type": "urn:leetkob:problem:lab-closed",
  "title": "Lab is closed",
  "status": 409,
  "detail": "The deadline for this lab has passed.",
  "instance": "/labs/8f2d1c34-5e6a-4f7b-9c10-1a2b3c4d5e6f/submissions"
}
```

## 5. Idempotency

- The key is scoped to the student: the pair (student, `Idempotency-Key`) is unique. Another student using the same key is unaffected and learns nothing.
- The key is stored in the database with the submission, under a unique constraint, in the same transaction that creates the submission. It is never kept only in memory, so it works across processes and restarts. Keys do not expire in PA#02.
- Same student, same key, same `labId` and same `code` (byte-exact): return 200 with the original response and `Idempotency-Replayed: true`. No new submission, no new grading job.
- A replay is answered from the stored result and does not re-check the deadline: a retry of a request that was accepted before `due_at` still gets its 200 after `due_at`.
- Same student, same key, different `labId` or `code`: 422 `idempotency-key-reused`.
- Two requests with the same key at the same time: the unique constraint lets exactly one create the submission; the other gets the 200 replay.
- Requests that fail with an error are not stored; a retry with the same key is evaluated again from the start.

## 6. Data the contract assumes

Tables introduced with the endpoint: `Class`, `ClassMember` (class, user), `Lab` (class, `opens_at`, `due_at`) and `Submission` (lab, student, key, code, `submitted_at`). Replay compares the stored code directly, byte-exact after JSON decoding; no code-hash column is required. Only the fields above are part of the contract; column names are an implementation detail.

## 7. Changing this contract

- Any change to behaviour covered here must change this file and its contract tests in the same pull request. The PR template asks about this.
- Breaking changes: removing or renaming a field, changing a status code or `type`, making validation stricter, changing the order of checks, or changing idempotency rules. They need agreement of all three team members and a line marked **breaking** in the changelog.
- Non-breaking changes: adding an optional response field or a new value of `status`. Clients must ignore unknown response fields and treat an unknown `type` by its status code.
- No version number in the URL during PA#02. The version at the top of this file is bumped on every change (patch for wording, minor for non-breaking, major for breaking).

### Changelog

| Version | Change |
| --- | --- |
| 0.1.0 | First draft. |
| 0.2.0 | Non-breaking: added section 9 (scope, edge cases) after a blind read found unspecified behaviour. No existing rule changed. |
| 1.0.0 | **Breaking:** require `exp` and reject expired JWTs without clock-skew grace. Reviewed follow-up authorized by the team through Hoang on 2026-11-10. Fix receipt-time handling and document full-precision deadline checks; align the data description with direct stored-code comparison. |
| 1.0.1 | Patch: listed method-not-allowed in the section 4 table (already in section 9 and tested by methodNotAllowedReturnsProblemBody). No behaviour change. |
| 1.0.2 | Patch: status is no longer draft. No behaviour change. |

## 8. Contract tests this file requires

One test per row; names are suggestions.

| Rule | Test |
| --- | --- |
| Each error `type` and its status in the table of section 4 | one test per `type` |
| Student of another class gets the same 404 as an unknown lab | `otherClassStudentGetsLabNotFound` |
| Student submits for their own class | `studentOfClassCreatesSubmission` (201, fields in section 4) |
| `TA` and `ADMIN` cannot submit | `taAndAdminAreForbidden` |
| Student identity comes from the token only | `studentIdIsTokenSubject` |
| Retry with same key and body | `sameKeySameBodyReplaysWithoutNewRow` (200, header, one row) |
| Same key, different body or lab | `sameKeyDifferentBodyIsRejected` |
| Concurrent same key | `concurrentSameKeyCreatesOneSubmission` |
| Retry after the deadline still replays | `replayAfterDeadlineStillReturnsOriginal` |
| Deadline boundary | `submissionAtDueAtIsLate` |
| Processing crosses deadline/opening after receipt | `receivedBeforeDeadlineIsAcceptedAfterProcessingCrossesDeadline`, `receivedBeforeOpeningStaysRejectedAfterProcessingCrossesOpening` |
| Sub-millisecond deadline precision | `deadlineComparisonDoesNotTruncateReceiptToMilliseconds` |
| Required expiry and no expiration grace | `tokenWithoutExpiryIsUnauthenticated`, `recentlyExpiredTokenIsUnauthenticated` |
| Oversized code is not stored | `oversizedCodeCreatesNoSubmission` |

## 9. Scope and edge cases

Rules added after a blind read of version 0.1.0. They only fill gaps; no rule above changes.

### Outside this contract

- Base URL, port and scheme: set per environment, not defined here.
- How tokens are issued: no login endpoint exists in PA#02. Tests and clients create their own HS256 tokens with the secret configured for the environment.
- Seed data (classes, labs, students, `opens_at`, `due_at`): created by each test. A lab always has `opens_at < due_at`.
- Grading, verdicts, and how long `queued` lasts: later features. There is no read endpoint for a submission in PA#02.
- Rate limiting: none in PA#02.

### Authentication details

- `role` is case-sensitive and must be exactly `ADMIN`, `TA` or `STUDENT`; any other value is 401.
- `sub` must be a UUID; otherwise 401. A `sub` with no matching user is 401.
- `exp` is required. Expiry uses the server's authentication clock, with zero clock-skew grace; an expired token is 401 even if it expired only one second ago. If `nbf` is present, a token not yet valid is also 401. Clients must refresh before expiry. The lab receipt-time clock and authentication-time validation have separate purposes.

### Order of checks with replays

- Steps 1 to 6 always run first, also on a retry. A retry whose body is invalid or too large gets its 400 or 413, not a 422.
- Membership is checked on every request. If a student has left the class, a retry gets 404, not a replay.
- Step 8 (open/closed) is skipped only for a replay (same student, key, `labId` and `code`). A new key on a closed lab is 409.
- A reused key with a different `code` on a closed lab is 422, because step 7 comes first.

### Body and headers

- The size limit applies to the UTF-8 bytes of the decoded `code` string (an escape such as `\u00e9` counts as 2 bytes). A request body over 262,144 bytes is also 413 `code-too-large`, before JSON parsing.
- Invalid JSON, an empty body, a top-level array, `code: null` or a non-string `code`: 400 `invalid-request`. Invalid JSON is decided before size.
- Invalid UTF-8 in the body: 400 `invalid-request`.
- `code` is stored exactly as sent: no trimming, newline conversion or normalization. "Blank" means every character is Unicode White_Space (including non-breaking space and U+3000).
- `Content-Type: application/json` with `charset=utf-8` is accepted; any other charset is 415.
- `Idempotency-Key` is case-sensitive: `ABC...` and `abc...` are different keys. Surrounding whitespace or a duplicated header is 400 `invalid-request`.
- Other HTTP methods on this path: 405 with a problem body `urn:leetkob:problem:method-not-allowed` and an `Allow: POST` header.
- `errors[].field` is `code`, `labId`, `Idempotency-Key` or `body` (for the whole body).
- `instance` is the request path as received, without the query string. `labId` in the response is lower-case; an upper-case UUID in the path is accepted and normalized.
- `Idempotency-Replayed` is present only on the 200 replay, with value `true`.

### Concurrency and retries

- Two requests with the same key at the same time: the second waits for the first to finish, then gets the 200 replay. It never gets a 500 for the constraint violation.
- After a 5xx or a timeout, retrying with the same key is always safe: either the original request was stored (200 replay) or it was not (evaluated again).
- A new submission does not remove older ones; which one counts is decided outside this contract.
