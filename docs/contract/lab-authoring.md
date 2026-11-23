# Contract: lab authoring

Status: 1.0.0 (PA#03). Source of truth for these endpoints: code and tests must follow this file. Product rules come from the FAQ (FAQ-05 limits, FAQ-06 constraints and deductions shown to students) and [PA3 data boundaries](pa3-boundaries.md): lab authoring is the only writer of `labs` (title, statement, limits), `lab_tests` and `lab_constraints`.

| Method and path | Purpose |
| --- | --- |
| `POST /classes/{classId}/labs` | A TA of the class creates a lab with its tests and constraints. |
| `GET /classes/{classId}/labs` | A TA of the class lists the class's labs with submission counts. |
| `GET /labs/{labId}` | A TA of the class or a student of the class reads one lab. Students never receive tests. |

## 1. Who may call them

Every endpoint needs the Bearer JWT of [the login contract](post-auth-login.md). The checks and
their problem types follow the existing contracts: a missing user or a changed role is 401, a
wrong global role is 403, and data outside the caller's classes is reported as not found.

| Caller | `POST`/`GET /classes/{classId}/labs` | `GET /labs/{labId}` |
| --- | --- | --- |
| No token, invalid or expired token | 401 `unauthenticated` | 401 `unauthenticated` |
| Token whose user does not exist, or whose `role` no longer equals `users.role` | 401 `unauthenticated` | 401 `unauthenticated` |
| Role `ADMIN` | 403 `forbidden-role` | 403 `forbidden-role` |
| Role `STUDENT` | 403 `forbidden-role` | 200 when a current member of the lab's class (`class_members`), else 404 `lab-not-found` |
| Role `TA` not in `class_tas` of the class | 404 `class-not-found` (same as an unknown class) | 404 `lab-not-found` (same as an unknown lab) |
| Role `TA` in `class_tas` of the class | 201 / 200 | 200, with tests |

## 2. `POST /classes/{classId}/labs`

```
POST /classes/{classId}/labs
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "title": "Sorting with merge sort",
  "statementMd": "# Sorting with merge sort\n\nRead `n` integers ...",
  "opensAt": "2026-11-24T01:00:00Z",
  "dueAt": "2026-12-01T16:59:59Z",
  "cpuTimeMs": 1000,
  "memoryMb": 256,
  "tests": [{ "input": "6\n5 2 9 1 5 6\n", "expectedOutput": "1 2 5 5 6 9\n" }],
  "constraints": [
    { "code": "C1", "text": "Do not call a library sort function: `std::sort`.", "deduction": 3 },
    { "code": "C2", "text": "Sort with a merge sort you wrote yourself.", "deduction": 4 }
  ]
}
```

| Field | Rule |
| --- | --- |
| `Content-Type` | `application/json`, no charset or `charset=UTF-8`. Otherwise 415 `unsupported-media-type`. |
| Body | One JSON object of at most 4 MiB in UTF-8 with only the fields below. Unknown fields are 400. |
| `title` | Required string, 1–200 characters after trimming (stored trimmed). |
| `statementMd` | Required string, Markdown, not blank, at most 65,536 characters. Stored as sent. |
| `opensAt`, `dueAt` | Required RFC 3339 timestamps with an offset (`Z` or `±hh:mm`); `opensAt` < `dueAt`. |
| `cpuTimeMs` | Optional integer 1000–5000, default 1000 (FAQ-05). Wall time is 3 × CPU time and is not stored. |
| `memoryMb` | Optional integer 64–512, default 256 (FAQ-05). |
| `tests` | Required array of 1–100 objects `{input, expectedOutput}`, both strings (may be empty) of at most 1 MiB each. Stored with `ordinal` = position + 1. |
| `constraints` | Optional array (default empty) of at most 20 objects `{code, text, deduction}`. Stored with `ordinal` = position + 1. |
| `constraints[].code` | `C` followed by a number 1–99 without leading zero (`C1`, `C2`, … `C99`); unique within the lab. |
| `constraints[].text` | Not blank, at most 2000 characters, stored trimmed. |
| `constraints[].deduction` | Number in (0, 10] with at most two decimals. Set by the TA only; the model never sets it (pa3-boundaries rule 4). |

Order of checks: authentication (401), role (403), `classId` is a UUID (400), the TA is assigned
to the class (404 `class-not-found`), `Content-Type` (415), body (400). Every 400 is
`invalid-request` with `errors[]`; each error names the field with its path, for example
`tests`, `constraints[1].code` or `dueAt`. A rejected request writes nothing. The lab, its tests
and its constraints are inserted in one transaction.

### 201 Created

`Location: /labs/{labId}`, `Cache-Control: no-store`, and the TA view of section 4.

## 3. `GET /classes/{classId}/labs`

Order of checks: authentication, role, `classId` (400), assignment (404 `class-not-found`).

```
200 OK
Cache-Control: no-store

[
  {
    "id": "8f2d1c34-5e6a-4f7b-9c10-1a2b3c4d5e6f",
    "title": "Sorting with merge sort",
    "opensAt": "2026-11-24T01:00:00.000Z",
    "dueAt": "2026-12-01T16:59:59.000Z",
    "cpuTimeMs": 1000,
    "memoryMb": 256,
    "testCount": 7,
    "constraintCount": 2,
    "submissionCount": 12,
    "studentsSubmitted": 5
  }
]
```

| Field | Rule |
| --- | --- |
| `title` | String, or null for labs created before PA#03. |
| `opensAt`, `dueAt` | RFC 3339 UTC, millisecond precision. |
| `testCount`, `constraintCount` | Rows in `lab_tests` and `lab_constraints`. |
| `submissionCount` | Every stored submission of the lab (all attempts, all students). |
| `studentsSubmitted` | Distinct students with at least one submission. |

Ordered by `opensAt` descending, then `id`. A class without labs returns `[]`.

## 4. `GET /labs/{labId}`

Order of checks: authentication, role (403 for `ADMIN`), `labId` is a UUID (400), access (404
`lab-not-found`), then for students only: the lab must be open (`now >= opensAt`), else 409
`lab-not-open`, so the statement is not revealed early.

```
200 OK
Cache-Control: no-store

{
  "id": "8f2d1c34-5e6a-4f7b-9c10-1a2b3c4d5e6f",
  "classId": "1b2c3d4e-0000-4000-8000-000000000001",
  "title": "Sorting with merge sort",
  "statementMd": "# Sorting with merge sort\n...",
  "opensAt": "2026-11-24T01:00:00.000Z",
  "dueAt": "2026-12-01T16:59:59.000Z",
  "cpuTimeMs": 1000,
  "wallTimeMs": 3000,
  "memoryMb": 256,
  "constraints": [
    { "code": "C1", "text": "Do not call a library sort function: `std::sort`.", "deduction": 3.00 }
  ],
  "tests": [{ "ordinal": 1, "input": "6\n5 2 9 1 5 6\n", "expectedOutput": "1 2 5 5 6 9\n" }]
}
```

| Field | Rule |
| --- | --- |
| `wallTimeMs` | 3 × `cpuTimeMs` (FAQ-05), computed. |
| `constraints` | Every constraint in `ordinal` order with its deduction, for TAs and students (FAQ-06). |
| `tests` | **TA view only.** The student view has no `tests` field at all (pa3-boundaries: tests are never returned to students). |

## 5. Errors (RFC 9457)

Every error is `application/problem+json` with `type`, `title`, `status`, `detail` and
`instance`, as in [the intake contract](post-labs-submissions.md). Clients branch on `type`.

| `type` | Status | When |
| --- | --- | --- |
| `urn:leetkob:problem:invalid-request` | 400 | Bad UUID in the path, or a body rule of section 2. |
| `urn:leetkob:problem:unauthenticated` | 401 | Section 1, first two rows. |
| `urn:leetkob:problem:forbidden-role` | 403 | Wrong global role (section 1). The title is shared with the intake contract; the `detail` names the allowed role. |
| `urn:leetkob:problem:class-not-found` | 404 | Unknown class, or a class the TA is not assigned to. |
| `urn:leetkob:problem:lab-not-found` | 404 | Unknown lab, or a lab outside the caller's classes. |
| `urn:leetkob:problem:method-not-allowed` | 405 | Other HTTP methods (also sends `Allow`). |
| `urn:leetkob:problem:lab-not-open` | 409 | A student reads a lab before `opensAt`. |
| `urn:leetkob:problem:unsupported-media-type` | 415 | `POST` with another `Content-Type`. |
| `urn:leetkob:problem:internal-error` | 500 | Unexpected failure. |

## 6. Data the contract assumes

Writes `labs` (`id`, `class_id`, `title`, `statement_md`, `opens_at`, `due_at`, `cpu_time_ms`,
`memory_mb`), `lab_tests` and `lab_constraints` (V1, V4). Reads `class_tas`, `class_members`,
`users.role` and `submissions` (counts only).

## 7. Changing this contract

The rules of [the intake contract](post-labs-submissions.md#7-changing-this-contract) apply.

### Changelog

| Version | Change |
| --- | --- |
| 1.0.0 | First version (T82). |

## 8. Contract tests this file requires

`backend/src/test/java/com/leetkob/backend/lab/LabAuthoringContractTest.java`:

| Test | Rule |
| --- | --- |
| `assignedTaCreatesLabWithTestsAndConstraints` | Section 2: 201, `Location`, stored rows with ordinals, TA view with tests. |
| `limitsDefaultToFaq05` | Section 2: `cpuTimeMs` 1000, `memoryMb` 256, `wallTimeMs` 3000 when omitted. |
| `invalidBodiesAreRejectedAndWriteNothing` | Section 2: no tests, duplicate or malformed code, deduction 0 or above 10 or with three decimals, limits out of range, `opensAt` ≥ `dueAt`, unknown field; 415. |
| `taOfAnotherClassGetsNotFound` | Section 1: 404 `class-not-found` on both class endpoints and 404 `lab-not-found` on the lab. |
| `wrongRolesAreForbidden` | Section 1: 403 `forbidden-role` for a student creating or listing, and for an admin. |
| `unauthenticatedRequestsAreRejected` | Section 1: 401 without a token and when the role changed. |
| `listShowsLabsWithSubmissionCounts` | Section 3 fields and order. |
| `studentSeesStatementAndDeductionsButNoTests` | Section 4: student view without `tests`; 404 for a student of another class; 409 before `opensAt`. |

## 9. Scope

- **No edit or delete.** Changing a lab after students submitted needs rules (re-judge,
  re-check) that are not decided yet; a later contract adds them.
- The browser's "import from files" fills the same `POST` body from the eval layout
  (`statement.md`, `constraints.json` with `id`/`text`/`deduction`, `tests/NN.in` and
  `tests/NN.out`); the API knows nothing about files.
