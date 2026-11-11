# T10 blind read of contract 0.1.0 (reader: a fresh AI subagent, not a person)

Method: one new subagent (Claude, model `sonnet`) was given only the text of `docs/contract/post-labs-submissions.md` at version 0.1.0 (merged as `4d71390`), with no repository access, no tools and no chat history. It was told to write the first request, the retry, seven failing requests, and to list every guess. Its output below is model output, summarised; the disposition column is the author's.

## Requests the reader produced from the file alone

- First submission: `POST $BASE/labs/<lab>/submissions` with `Authorization: Bearer`, `Idempotency-Key`, `Content-Type: application/json` and body `{"code": "..."}`; expected 201 with `id, labId, studentId, status, submittedAt, sizeBytes`.
- Retry after timeout: same request and key, expected 200 with `Idempotency-Replayed: true`.
- Seven failures, each mapped to the right status, `type` and step of the order of checks: wrong content type (415, step 3), TA token (403, step 2), key reused with other code (422, step 7), code over 65,536 bytes (413, step 6), missing key (400, step 4), student of another class (404, step 5), extra body field (400, step 6). All seven matched the contract's intent.

## Gaps listed by the reader (22) and what was done in version 0.2.0

| # | Gap | Rating | Disposition |
| --- | --- | --- | --- |
| 1 | No base URL | blocker | Declared out of scope (section 9) |
| 2 | No way to get a token, no fixtures | blocker | Declared out of scope; tests mint HS256 tokens (section 9) |
| 3 | Replay versus steps 1-6 and membership | blocker | Specified (section 9, order with replays) |
| 4 | Unknown `role`, non-UUID `sub` | should fix | Specified: 401 |
| 5 | Order makes a non-member without key get 400 | should fix | Left as is; stated order already applies, noted here as a design trade-off |
| 6 | Size on decoded string vs body | should fix | Specified (262,144-byte body cap, UTF-8 bytes of decoded `code`) |
| 7 | Blank and whitespace, stored raw or trimmed | should fix | Specified |
| 8 | Key case, whitespace, duplicates | should fix | Specified |
| 9 | Concurrency while winner uncommitted | should fix | Specified (waits, never 500) |
| 10 | Which old submission counts | should fix | Stated as outside the contract |
| 11 | Invalid JSON plus huge size | should fix | Specified (invalid JSON first) |
| 12 | Content-Type parameters, invalid UTF-8 | should fix | Specified |
| 13 | Other methods, empty body | should fix | Specified (405, 400) |
| 14 | Reused key on closed lab; `opens_at` equal or null | should fix | Specified |
| 15 | Rate limits, retry after 5xx | minor | Specified (none; retry safe) |
| 16 | `instance` form, UUID case | minor | Specified |
| 17 | `errors[].field` names | minor | Specified |
| 18 | `Idempotency-Replayed` on 201 | minor | Specified (absent) |
| 19 | Retention of stored code | minor | Not addressed |
| 20 | Duplicate JSON keys, nesting depth, arrays | minor | Arrays and null covered; duplicate keys and depth not addressed |
| 21 | Role case | minor | Specified (case-sensitive) |
| 22 | What follows `queued` | minor | Stated as outside the contract |

Limits of this evidence: the reader is an AI agent, not Hoà or a student, and it saw only the text. It does not replace the rubric's "a stranger can write a client from the file" if the course expects a human reader.
