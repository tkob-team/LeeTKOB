# Contract: `GET /labs/{labId}/review-queue`

Status: 1.1.0 (PA#03). Source of truth for this endpoint: code and tests must follow this file. Product rules come from the FAQ (FAQ-02 counted submission, FAQ-08 what students see, FAQ-09 unsure) and [PA3 data boundaries](pa3-boundaries.md) (who writes `findings`).

The TA review queue lists, for one lab, the counted submission of every student with the
checker's verdict for each constraint, so a TA can review violations and unsure verdicts
first. With `includeEarlier=true` it also lists each student's earlier AC submissions, marked
`counted: false`, for reference only. It is read-only.

FAQ-02 (LeeTKOB-FAQ): "**Bài được tính là bài nộp cuối cùng trước hạn, dù kết quả của nó là
gì.**" and "hàng chờ chỉ hiện kết quả của bài được tính". The default response follows this
exactly. `includeEarlier=true` exists so a TA (and the PA#3 walkthrough, where one student
submits three solutions) can see the checker's findings for every AC submission; the earlier
ones are labelled as not counted, never replace the counted submission and play no part in
grading.

## 1. Who may call it

| Caller | Result |
| --- | --- |
| No token, invalid or expired token | 401 `unauthenticated` (with `WWW-Authenticate: Bearer`) |
| Token whose user does not exist, or whose `role` no longer equals `users.role` | 401 `unauthenticated` |
| Valid token with role `STUDENT` or `ADMIN` | 403 `forbidden-role` |
| Valid `TA` token, but the TA is not in `class_tas` of the lab's class | 404 `lab-not-found` (same as an unknown lab, so the lab's existence is not revealed) |
| Valid `TA` token of a TA assigned to the lab's class | 200 |

A TA of another class gets 404, not 403, following the rule already used by
`POST /labs/{labId}/submissions` and `GET /labs/{labId}/submissions/{submissionId}`: data
outside the caller's classes is reported as not found.

## 2. Request

```
GET /labs/{labId}/review-queue?page=0&size=20&includeEarlier=true
Authorization: Bearer <JWT>
```

| Part | Rule |
| --- | --- |
| `labId` (path) | UUID. Any other value is 400 `invalid-request`. |
| `page` (query) | Optional integer ≥ 0, default 0. Otherwise 400 `invalid-request`. |
| `size` (query) | Optional integer 1–100, default 20. Otherwise 400 `invalid-request`. |
| `includeEarlier` (query) | Optional, exactly `true` or `false`, default `false`. Any other value (including empty) is 400 `invalid-request`. |

## 3. Rules and order of checks

1. Authentication and the user/role check (section 1, 401).
2. Role must be `TA` (403 `forbidden-role`).
3. `labId`, `page`, `size`, `includeEarlier` are validated (400 `invalid-request`).
4. The lab must exist and the TA must be assigned to its class (404 `lab-not-found`).
5. The queue is built from the counted submissions (FAQ-02): for each student who is a current
   member of the lab's class, the latest submission with `submitted_at < due_at` (equal times
   ordered by submission ID). Before the deadline the list is provisional (`provisional: true`)
   and changes when a student submits again; after the deadline it is final.
6. With `includeEarlier=true`, every other submission of the same student with
   `submitted_at < due_at` whose test verdict is AC is added with `counted: false`, together with
   its findings. Non-AC earlier submissions, submissions at or after the deadline and submissions
   of students who left the class are never added.

## 4. Responses

### 200 OK

```
Content-Type: application/json
Cache-Control: no-store

{
  "labId": "8f2d1c34-5e6a-4f7b-9c10-1a2b3c4d5e6f",
  "provisional": false,
  "page": 0,
  "size": 20,
  "totalItems": 2,
  "totalPages": 1,
  "items": [
    {
      "submissionId": "0b7e5a52-2a45-4c53-8d49-4b8a3a5cfb10",
      "counted": true,
      "student": { "id": "c1d2e3f4-0a1b-4c2d-8e3f-9a0b1c2d3e4f", "displayName": "Lan Nguyen" },
      "submittedAt": "2026-11-10T03:15:42.120Z",
      "judgeStatus": "completed",
      "verdict": "AC",
      "reviewStatus": "checked",
      "needsReview": true,
      "constraints": [
        {
          "code": "C1",
          "text": "Do not call a library sort function: `std::sort`.",
          "deduction": 3.00,
          "verdict": "violation",
          "source": "hard_rule",
          "evidence": [{ "line": 12, "text": "    std::sort(a, a + n);" }],
          "reason": "uses banned `std::sort`",
          "unsureCause": null,
          "needsReview": true
        },
        {
          "code": "C2",
          "text": "Sort with a merge sort you wrote yourself.",
          "deduction": 4.00,
          "verdict": "unsure",
          "source": "guardrail",
          "evidence": [],
          "reason": "no answer within 30 s",
          "unsureCause": "timeout",
          "needsReview": true
        }
      ]
    }
  ]
}
```

| Field | Type | Rule |
| --- | --- | --- |
| `labId` | UUID | Same as the path. |
| `provisional` | boolean | True before the lab's deadline (FAQ-02). |
| `page`, `size` | integer | The page returned and its size. |
| `totalItems` | integer | Number of counted submissions in the lab, plus the earlier AC submissions when `includeEarlier=true`. |
| `totalPages` | integer | `ceil(totalItems / size)`; 0 when there are no items. |
| `items[].submissionId` | UUID | The submission. |
| `items[].counted` | boolean | True for the counted submission (FAQ-02). False only for an earlier AC submission returned because of `includeEarlier=true`. Always true without it. |
| `items[].student` | object | `id` (UUID) and `displayName` (string or null). |
| `items[].submittedAt` | string | RFC 3339 UTC, millisecond precision. |
| `items[].judgeStatus` | string | `queued`, `grading` or `completed`, as in the student polling contract. |
| `items[].verdict` | string or null | Test verdict: AC, WA, TLE, MLE, RE, CE; null until judged. |
| `items[].reviewStatus` | string | `reviewing` while the submission is not judged yet, or is AC and some constraint has no finding yet ("đang soát" in the UI); `checked` when every constraint has a finding; `not_checked` when the test verdict is not AC (the checker only runs on AC, so no findings exist). |
| `items[].needsReview` | boolean | True when any constraint has `needsReview: true`. |
| `items[].constraints[]` | array | Every constraint of the lab in `ordinal` order, also while reviewing. |
| `…code`, `…text` | string | From `lab_constraints`. |
| `…deduction` | number | The deduction the TA set in `lab_constraints` (0.01–10). The model never sets it. |
| `…verdict` | string or null | `pass`, `violation`, `unsure`; null while there is no finding. |
| `…source` | string or null | `hard_rule`, `model` or `guardrail`; null while there is no finding. |
| `…evidence` | array | `{line, text}` with the original source line; empty for `pass`, `unsure` or no finding. |
| `…reason` | string or null | The checker's reason; null while there is no finding. |
| `…unsureCause` | string or null | For `unsure`: `model`, `schema`, `timeout`, `evidence` or `cost_cap` (FAQ-09); otherwise null. |
| `…needsReview` | boolean | True when `verdict` is `violation` or `unsure`. |

The response never includes the source code, test input or output, or a publish action.

### Errors (RFC 9457)

Every error is `application/problem+json` with `type`, `title`, `status`, `detail` and
`instance`, as in [the intake contract](post-labs-submissions.md). Clients branch on `type`.

| `type` | Status | Title | When |
| --- | --- | --- | --- |
| `urn:leetkob:problem:invalid-request` | 400 | Invalid request | Bad `labId`, `page`, `size` or `includeEarlier`. |
| `urn:leetkob:problem:unauthenticated` | 401 | Authentication is required | Section 1, first two rows. |
| `urn:leetkob:problem:forbidden-role` | 403 | Role is not allowed to submit | Role `STUDENT` or `ADMIN`. The title is shared with the intake contract; the `detail` says that only the lab's TA may read the queue. |
| `urn:leetkob:problem:lab-not-found` | 404 | Lab not found | Unknown lab, or a lab in a class the TA is not assigned to. |
| `urn:leetkob:problem:method-not-allowed` | 405 | Method not allowed | Other HTTP methods (also sends `Allow: GET`). |
| `urn:leetkob:problem:internal-error` | 500 | Internal error | Unexpected failure. |

## 5. Paging and order

Items are ordered by `counted` (true first), then `needsReview` (true first), then
`submittedAt`, then `submissionId`. Paging applies after ordering, so every counted submission
comes before every earlier one, and among each group every item that needs review comes before
every item that does not, across pages. Without `includeEarlier` all items are counted and the
order is the 1.0.0 order. A page past the end returns 200 with an empty `items` list.

## 6. Data the contract assumes

`submissions`, `judge_jobs` (status and verdict), `class_members` (current members),
`class_tas`, `lab_constraints` (code, text, ordinal, deduction) and `findings` (written only by
the checker, once per pair). `users.display_name` may be null.

## 7. Changing this contract

The rules of [the intake contract](post-labs-submissions.md#7-changing-this-contract) apply.

### Changelog

| Version | Change |
| --- | --- |
| 1.0.0 | First version (T77). |
| 1.1.0 | Optional `includeEarlier` query parameter; `items[].counted`; order by `counted` first. Default response unchanged apart from the new `counted: true` field. Requested after the PA#3 walkthrough (docs/pa3/walkthrough.md, issue 5). |

## 8. Contract tests this file requires

`backend/src/test/java/com/leetkob/backend/review/ReviewQueueContractTest.java`:

| Test | Rule |
| --- | --- |
| `assignedTaSeesCountedSubmissionsWithFindings` | Section 4 shape; counted submission only (FAQ-02); constraints in order; evidence, reason, unsureCause, deduction. |
| `taOfAnotherClassGetsLabNotFound` | Section 1: 404 `lab-not-found`. |
| `studentAndAdminAreForbidden` | Section 1: 403 `forbidden-role`. |
| `unauthenticatedRequestIsRejected` | Section 1: 401. |
| `itemsNeedingReviewComeFirstAcrossPages` | Section 5 order and paging fields. |
| `submissionWithoutAllFindingsIsReviewing` | `reviewStatus` `reviewing` and null finding fields; `not_checked` for a non-AC verdict. |
| `invalidPagingIsRejected` | Section 2: 400 `invalid-request`. |
| `includeEarlierAddsEarlierAcSubmissionsAfterCountedOnes` | Section 3 rule 6: earlier AC submissions with findings and `counted: false`, after every counted one; non-AC and late submissions excluded; default and `includeEarlier=false` unchanged. |
| `oneStudentWithThreeAcSubmissionsHasOneCountedAndTwoEarlier` | One student, three AC submissions: one `counted: true`, two `counted: false`; a TA of another class still gets 404 `lab-not-found`. |
| `invalidIncludeEarlierIsRejected` | Section 2: 400 `invalid-request` for values other than `true`/`false`. |

## 9. Scope

- **No publish and no grade change.** This endpoint and the review screen have no action to
  publish, accept, reject or change a deduction. Those are later contracts.
- **Students never receive findings.** No student endpoint returns findings, verdicts of the
  checker, evidence or deductions before publication. FAQ-08: "Trước khi công bố: không. Sinh
  viên chỉ thấy kết quả chấm test (FAQ-02). Kết quả của cả luật cứng lẫn mô hình đều ẩn." The
  student polling contract ([get-student-judge-status.md](get-student-judge-status.md)) omits
  findings and its contract test checks it.
- `unsure` verdicts are shown to the TA with their cause (FAQ-09) and never to students.
