# PA#03 evidence

Team: `23120255-23120262-23120264`. This file lists what a grader needs to check PA#03 on
the deployment and on their own machine. Commands are the ones in the [README](README.md).

## Deployment and accounts

Site: https://tkob-leetkob.duckdns.org

| Account | Role | Class | Password |
| --- | --- | --- | --- |
| `admin@leetkob.test` | Administrator | — | `fNQ8K+gJLGEwgNr0RWaZYhP/` |
| `ta1@leetkob.test` | TA | "Lớp thử nghiệm 1" | `weWxtfLug+HKwMAUauSr5idc` |
| `ta2@leetkob.test` | TA | "Lớp thử nghiệm 2" | `weWxtfLug+HKwMAUauSr5idc` |
| `sv1@leetkob.test` | Student | "Lớp thử nghiệm 1" | `1eg6gQwDhA46Fk2g9DHVcEQg` |
| `sv2@leetkob.test` | Student | "Lớp thử nghiệm 1" | `1eg6gQwDhA46Fk2g9DHVcEQg` |

These are public test accounts with seeded data only; they hold no real student data.

The checker calls Google Gemini on the Free tier. The key's Google project has no billing
account, so the real cost is USD 0. The risk is running out of the daily quota: verdicts
then become `unsure` (see [Model and cost](README.md#model-and-cost)).

## Criterion 1: the flow in the web UI

Follow [docs/pa3/walkthrough.md](docs/pa3/walkthrough.md): ta1 creates a lab from the files
of `eval/dev/problems/sort-merge/`, students submit, the judge grades, the checker proposes
findings, ta1 reads the review queue, and ta2 is refused with 404.

The create-lab form imports a problem in two ways. **Nhập thư mục** picks the folder
`eval/dev/problems/sort-merge/` and reads `statement.md`, `constraints.json` and the tests
`NN.in`/`NN.out` by path, either under `tests/` or at the top of the folder (anything else goes
to "Cần xem lại"); a form that already
holds something is replaced only after "Thay toàn bộ đề, ràng buộc và test bằng nội dung thư
mục sort-merge?". **Nhập từ file** adds parts: tests are matched by number, new numbers are
added ("Đã thêm 7 test (01–07), tổng 7 test."), identical files change nothing, and a number
already on the form with other content opens a dialog to overwrite those and keep the rest,
replace every test, or cancel; a different statement or constraints ask before replacing.
Each test can be deleted on its own.

The TA works from "Lớp của tôi" (`/ta/classes`): a class page lists its labs with the
latest opening first, so a lab just created for this week is the top row, and each row has
**Hàng chờ duyệt: <lab title>**.

One student can show all three solutions: sv1 submits s09, s01 and s04 in turn. The queue
then shows the last one as the counted submission and lists the two earlier AC submissions
under "Các lần nộp cũ hơn (không tính điểm)". The "Nguồn" column of the queue says who
decided each finding: "Luật cứng" (hard rule, no model), "Mô hình" (the model) or "Chặn an
toàn" (a guardrail such as a timeout or a schema error).

The latest run on the deployment, with an admin pass and sandbox attacks, is
[Run 3 results](docs/pa3/walkthrough.md#run-3-results-2026-11-28).

- Demo video: https://youtu.be/1j7CANdt1qI
- Demo lab id on the deployment: `10a6d166-c4f1-45f1-bd8c-e78d5cb094a5`; its review queue is
  https://tkob-leetkob.duckdns.org/ta/labs/10a6d166-c4f1-45f1-bd8c-e78d5cb094a5/review (sign in
  as `ta1@leetkob.test`).

### Admin and class membership

- `admin@leetkob.test` signs in and lands on `/admin/classes` (class list): a form to create
  a class (empty or longer than 200 characters is refused under the field before sending)
  and one row per class with the class name linking to its page, every TA by name with the
  email below (or "Chưa có trợ giảng"), the number of students, and the invite code with
  "Sao chép" (the button reads "Đã sao chép" for 2 seconds without changing width). A new
  class is confirmed by a toast at the bottom right ("Đã tạo lớp <tên>.", hides after
  5 seconds). The list comes from one call, `GET /admin/classes`.
- `/admin/classes/<id>` (class page): the invite code with "Sao chép", "Trợ giảng (n)" by name
  and email, and "Sinh viên (n)" as a table with a checkbox, name, email, "Đã nộp" ("4 lab · 14 lần":
  the labs of this class the student submitted to and every attempt, or "Chưa nộp") and a
  right-aligned "Gỡ". A line under the heading says "Chỉ gỡ được sinh viên chưa nộp bài trong
  lớp.". To assign a TA, pick one
  in "Gán thêm trợ giảng" (only TAs not yet in this class, shown as "Tên — email") and press
  "Gán" (pressed with nothing chosen it says "Chọn một trợ giảng." under the field): a toast
  says "Đã gán <tên>.", the TA appears in the list and leaves the picker. When every TA is
  in the class the form is replaced by "Mọi trợ giảng đã được gán cho lớp này.". Members
  come from `GET /admin/classes/<id>/members`, the picker from `GET /admin/tas`
  ([class API contract](docs/contract/classes.md), 1.2.0; `submissionCount` since 1.4.0,
  `submittedLabCount` since 1.5.0). The TA's own roster
  (`GET /classes/<id>/members`) still returns ids and roles only, so the review queue stays
  anonymous.
- Each TA and each student on the class page has **Gỡ**. Pressing it opens a dialog (a
  native modal `<dialog>`, not a browser confirm): "Gỡ <tên> khỏi <lớp>?" with what happens
  for that role (a TA "sẽ không còn xem được lab và hàng chờ duyệt của lớp này. Có thể gán
  lại sau."; a student "sẽ không còn thấy lab của lớp này…"), "Huỷ" focused and "Gỡ <tên>"
  in red. Esc or a click outside cancels; while the request runs the buttons are locked and
  read "Đang gỡ…". On success the dialog closes, a toast says "Đã gỡ <tên> khỏi lớp." and
  the focus moves to the section heading. A removed TA loses access to the class's labs and
  review queue at once (404, as for a TA of another class) and returns to the picker. A
  student who has submitted in the class cannot be removed: their "Gỡ" and checkbox are
  locked, with "Đã có bài nộp, không gỡ được." as their tooltip and "Đã có bài nộp" as their
  accessible description, so the admin knows before trying; if a
  submission arrives meanwhile the dialog stays open with "<tên> đã có bài nộp trong lớp nên
  chưa gỡ được." and only "Đóng" (409 `member-has-submissions`, class API contract 1.3.0:
  `DELETE /admin/classes/<id>/tas/<userId>`, `DELETE /admin/classes/<id>/students/<userId>`).
- **Bulk removal**: tick students (the header checkbox selects every removable row, Shift+click
  a range); a bar above the table, whose space is always reserved so the table does not move,
  says "Chọn sinh viên để gỡ nhiều người cùng lúc." while nothing is ticked, then "Đã chọn N
  sinh viên" with "Bỏ chọn" and "Gỡ N sinh viên". The dialog lists up to five
  names and "và N khác"; confirming shows "Đang gỡ i/N…" while at most four requests run at
  once, then the result of each student ("Đã gỡ", "Đã có bài nộp, chưa gỡ", "Lỗi: …") and
  "Đóng". Removed rows leave the table, rows that failed stay ticked, and a toast sums up
  ("Đã gỡ 9/12 sinh viên.").
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
  available (PA4). A TA cannot see or remove students by name. Bulk removal sends one
  `DELETE` per student (at most four at once), not one transaction: an interrupted run leaves
  the students already removed removed, and the result dialog says who.
- UI problems moved to PA4: #4, #6/#16, #9, #10, #14, #15, #17, described in
  [docs/pa3/walkthrough.md](docs/pa3/walkthrough.md#moved-to-pa4).

## AI log

AI-assisted work on this release is recorded in [AI-LOG.md](AI-LOG.md).
