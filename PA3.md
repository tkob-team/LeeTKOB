# PA#03 evidence

Team: `23120255-23120262-23120264`. This file lists what a grader needs to check PA#03 on
the deployment and on their own machine. Commands are the ones in the [README](README.md).

## Deployment and accounts

Site: https://tkob-leetkob.duckdns.org

| Account | Role | Class |
| --- | --- | --- |
| `admin@leetkob.test` | Administrator | — |
| `ta1@leetkob.test` | TA | "Lớp thử nghiệm 1" |
| `ta2@leetkob.test` | TA | "Lớp thử nghiệm 2" |
| `sv1@leetkob.test` | Student | "Lớp thử nghiệm 1" |
| `sv2@leetkob.test` | Student | "Lớp thử nghiệm 1" |

Password for every account: `<SV điền>`. These are public test accounts with seeded data
only; they hold no real student data.

The checker calls Google Gemini on the Free tier. The key's Google project has no billing
account, so the real cost is USD 0. The risk is running out of the daily quota: verdicts
then become `unsure` (see [Model and cost](README.md#model-and-cost)).

## Criterion 1: the flow in the web UI

Follow [docs/pa3/walkthrough.md](docs/pa3/walkthrough.md): ta1 creates a lab from the files
of `eval/dev/problems/sort-merge/`, students submit, the judge grades, the checker proposes
findings, ta1 reads the review queue, and ta2 is refused with 404.

The TA works from "Lớp của tôi" (`/ta/classes`): a class page lists its labs with the
latest opening first, so a lab just created for this week is the top row, and each row has
**Hàng chờ duyệt: <lab title>**.

One student can show all three solutions: sv1 submits s09, s01 and s04 in turn. The queue
then shows the last one as the counted submission and lists the two earlier AC submissions
under "Các lần nộp cũ hơn (không tính điểm)".

- Demo video: `<link video>`
- Demo lab id on the deployment: `<id>`

### Admin and class membership

- `admin@leetkob.test` signs in and lands on `/admin/classes` (class list): a form to create
  a class (empty or longer than 200 characters is refused under the field before sending)
  and one row per class with the class name linking to its page, every TA by name with the
  email below (or "Chưa có trợ giảng"), the number of students, and the invite code with
  "Sao chép". The list comes from one call, `GET /admin/classes`.
- `/admin/classes/<id>` (class page): the invite code with "Sao chép", "Trợ giảng (n)" by name
  and email, and "Sinh viên (n)" as a name and email table. To assign a TA, pick one in the
  list (only TAs not yet in this class, shown as "Tên — email") and press "Gán": the page
  says "Đã gán <tên>.", the TA appears in the list and leaves the picker. When every TA is
  in the class the form is replaced by "Mọi trợ giảng đã được gán cho lớp này.". Members
  come from `GET /admin/classes/<id>/members`, the picker from `GET /admin/tas`
  ([class API contract](docs/contract/classes.md), 1.2.0). The TA's own roster
  (`GET /classes/<id>/members`) still returns ids and roles only, so the review queue stays
  anonymous.
- Each TA and each student on the class page has **Gỡ**. Pressing it asks in place
  ("Xác nhận gỡ <tên>?" and "Huỷ", no browser dialog); confirming removes the member and the
  page says "Đã gỡ <tên>.". A removed TA loses access to the class's labs and review queue at
  once (404, as for a TA of another class) and returns to the picker. A student can be
  removed only while they have no submission in the class; otherwise the page says "<tên>
  đã có bài nộp, chưa gỡ được." (409 `member-has-submissions`, class API contract 1.3.0:
  `DELETE /admin/classes/<id>/tas/<userId>`, `DELETE /admin/classes/<id>/students/<userId>`).
- A TA sees the invite code of their own classes on "Lớp của tôi" and on each class page.
- A student joins a class by entering the invite code on the student lab list.

## Continuous integration

[CI runs for the `pa3` tag](https://github.com/tkob-team/LeeTKOB/actions/workflows/ci.yml?query=branch%3Apa3).
The `sandbox` job builds the sandbox image and runs `DockerSandboxTest` (the nine sandbox
minimums, 11 tests) and `JudgeWorkerRestartTest`; the other jobs run `make lint`,
`make format-check`, `make typecheck` and `make test`. To reproduce the sandbox job, see
[PA#03 submission and judge](README.md#pa03-submission-and-judge).

Tests in
[DockerSandboxTest](backend/src/test/java/com/leetkob/backend/judge/DockerSandboxTest.java):

| # | Minimum | Test |
| --- | --- | --- |
| 1 | No network | `submissionHasOnlyLoopbackAndCannotConnectOrResolveExternally` |
| 2 | CPU time limit | `busySubmissionHitsCpuBudgetBeforeWallTime` |
| 3 | Wall time limit, no container left | `waitingSubmissionHitsWallLimitAndLeavesNoContainer` |
| 4 | Memory limit | `memoryCapKillsAllocationAfterTheSubmissionReadsPagesBack` |
| 5 | Process limit | `creatingMoreThanSixteenTasksIsDenied` |
| 6 | Output limit | `outputOverOneMebibyteEndsExecution` |
| 7 | Not root | `nonRootSubmissionRunsUnderAnIsolatedSupervisor` |
| 8 | No host workspace or Docker socket | `hostWorkspaceAndDockerSocketAreNotMounted` |
| 9 | No secrets | `submissionCannotReadServiceEnvironment`, `submissionCannotFindSecretFilesOrKeyMarkers`, `compilerCannotIncludeEnvironmentOrSecretFiles` |

## Checker command

The checker reads a dataset folder and writes one prediction per (solution, constraint);
details in [Checker command](README.md#checker-command).

```sh
cd checker && uv run leetkob-check --data ../eval/dev --out ../out/predictions.jsonl
```

`MODEL_OFF=1` runs the hard rules only: semantic constraints are `unsure` and no network
client is created. The Docker image needs no network at run time:

```sh
docker build -t leetkob-checker checker
docker run --rm --network none --memory 1g --pids-limit 256 -e MODEL_OFF=1 \
  -v "$PWD/eval/dev:/data:ro" -v "$PWD/out:/out" \
  leetkob-checker --data /data --out /out/predictions.jsonl
node eval/dev/eval.mjs --data eval/dev --predictions out/predictions.jsonl
```

Result of these commands on 2026-11-28 (copy of the dataset outside the repository, scored
with the lecturer's `eval.mjs`):

| Dataset | Pairs | Exit code | Wrongful deductions | Recall | Unsure rate | Ban-list pairs `unsure` |
| --- | --- | --- | --- | --- | --- | --- |
| `eval/dev` | 102 | 1 | 0 | 40.5% (15/37) | 46.1% (47/102) | 0 of 55 |
| `eval/own` | 14 | 1 | 0 | 62.5% (5/8) | 35.7% (5/14) | 0 of 9 |

Exit 1 is expected with the model off: every semantic pair is `unsure`, so recall and the
unsure rate miss their thresholds. Wrongful deductions stay 0 and every ban-list pair gets
`pass` or `violation` from the hard rules.

## Hard rules first

A ban-list constraint ("Do not use" / "Do not call") is decided from the C++ syntax tree
built by tree-sitter in
[checker/src/checker/hard_rules.py](checker/src/checker/hard_rules.py), never by a text
search and never by the model. Trap tests in
[checker/tests/test_hard_rules.py](checker/tests/test_hard_rules.py):

- `test_own_sort_in_a_namespace_is_not_the_library_sort`
- `test_banned_name_in_comment_or_string_is_ignored`
- `test_algorithm_header_used_only_for_swap`
- `test_prompt_injection_in_a_comment_does_not_change_the_verdict`
- `test_code_disabled_by_if_zero_is_never_compiled`

In the committed run's `calls.jsonl`, the 55 ban-list pairs have `"called": false` and
`"decided_by": "hard_rule"`; only the other 47 pairs called the model. The model-off results
above (0 wrongful deductions, 0 ban-list pairs `unsure` on `eval/dev` and `eval/own`) show
the hard rules alone take no wrongful deduction.

## What the model sees

One call per semantic pair carries only the problem statement, that one constraint and the
code with comments replaced by spaces (line numbers kept) and 8-digit student IDs and email
addresses masked ([checker/src/checker/redact.py](checker/src/checker/redact.py)). No
solution id, file name or identity is sent. Tests:

- `checker/tests/test_model_judge.py::test_sanitize_blanks_comments_and_keeps_line_numbers`
- `checker/tests/test_model_limits.py::test_prompt_received_has_no_comments_and_no_student_id`
- `checker/tests/test_redact_and_prices.py::test_ids_and_emails_are_masked_inside_string_and_char_literals_only`
- `checker/tests/test_redact_and_prices.py::test_id_in_a_comment_disappears_with_the_comment`
- `checker/tests/test_prompt.py::test_prompt_template_names_no_dev_problem_or_solution`
- `checker/tests/test_prompt.py::test_built_prompt_adds_only_the_given_statement_constraint_and_code`

A scan of the 47 prompts in the committed `calls.jsonl` on 2026-11-28 found no `//`, no
`/*`, no email address, no 8-digit number and no dev solution id.

The model answers `verdict` (`pass`, `violation` or `unsure`), `evidence` (line and text) and
`reason`. The response schema has no deduction field and allows no other property:
`checker/src/checker/model_judge.py:34` (`OUTPUT_SCHEMA`).

## Own eval cases

[eval/own/](eval/own/README.md) has 3 new problems (`count-distinct`, `digit-sum-recursive`,
`modpow-fast`) with 14 labelled (solution, constraint) pairs in the same layout as
`eval/dev/`, tagged like the dev set, including `trap` and `injection` cases. Score a
prediction file with:

```sh
node eval/dev/eval.mjs --data eval/own --predictions <predictions.jsonl>
```

## Run with the model

The committed dev-set run with `gemini-3.5-flash-lite` (`--no-fallback`):

- [predictions.jsonl](eval/runs/2026-11-23-gemini-3.5-flash-lite/predictions.jsonl)
- [eval-report.txt](eval/runs/2026-11-23-gemini-3.5-flash-lite/eval-report.txt):
  0 wrongful deductions, recall 100.0% (37/37), unsure rate 0.0% (0/102).
  eval-report.txt was produced from a local copy before it was committed as
  predictions.jsonl; re-scoring the committed file on 2026-11-28 gives the same body (only
  the path line differs). sha256 of the committed predictions.jsonl:
  `a3a042dcbe3537fbf4513197670febb7a6fd752ddd6a21bf2a3360ddae2122aa`.
- [calls.jsonl](eval/runs/2026-11-23-gemini-3.5-flash-lite/calls.jsonl): one line per pair;
  each of the 47 model calls carries its `provider_request_id`, model, prompt, tokens,
  latency and a cost estimate.

Tokens and the cost of one lab: [Model and cost](README.md#model-and-cost).

## Limits

- Model output outside the JSON schema becomes `unsure` with cause `schema`:
  `checker/tests/test_model_limits.py::test_output_outside_the_schema_is_unsure_schema`.
- A model call slower than the timeout becomes `unsure` with cause `timeout`:
  `checker/tests/test_model_limits.py::test_slow_model_is_unsure_timeout` and
  `checker/tests/test_model_limits.py::test_client_timeout_error_is_unsure_timeout`.
- There is no Publish action. Before publication a student sees only the judge result, as
  [FAQ-08](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-08) says: "Trước khi
  công bố: không. Sinh viên chỉ thấy kết quả chấm test
  ([FAQ-02](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-02)). Kết quả của
  cả luật cứng lẫn mô hình đều ẩn." See
  [get-review-queue](docs/contract/get-review-queue.md) and
  [get-student-judge-status](docs/contract/get-student-judge-status.md).
- Verdicts live only in the TA's review queue (`GET /labs/{labId}/review-queue`). In this
  version no path turns a verdict into a grade.

## Known limitations

- The JWT lives 8 hours and has no refresh. There is no server-side revocation; sign-out
  only clears the browser copy. The frontend keeps it in `localStorage`.
- There is no per-lab cap on model calls yet (planned: 800 calls per lab, FAQ-09).
- Students join a class with an invitation code, as in Google Classroom. Changing the code
  is not available yet (PA4).
- The admin can remove a TA, and a student only while the student has no submission in the
  class. Removing a student who has submitted, deleting a class and deleting a lab are not
  available (PA4). A TA cannot see or remove students by name.
- UI problems moved to PA4: #4, #6/#16, #9, #10, #14, #15, #17, described in
  [docs/pa3/walkthrough.md](docs/pa3/walkthrough.md#moved-to-pa4).

## AI log

AI-assisted work on this release is recorded in [AI-LOG.md](AI-LOG.md).
