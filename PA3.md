# PA#03 evidence

Team: `23120255-23120262-23120264`. This file lists what a grader needs to check PA#03 on
the deployment and on their own machine. Commands are the ones in the [README](README.md).

## Deployment and accounts

Site: https://tkob-leetkob.duckdns.org

| Account | Role | Class |
| --- | --- | --- |
| `admin@leetkob.test` | Administrator | — |
| `ta1@leetkob.test` | TA | "Lớp thử nghiệm 1" |
| `ta2@leetkob.test` | TA | a second class, not "Lớp thử nghiệm 1" |
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

One student can show all three solutions: sv1 submits s09, s01 and s04 in turn. The queue
then shows the last one as the counted submission and lists the two earlier AC submissions
under "Các lần nộp cũ hơn (không tính điểm)".

- Demo video: `<link video>`
- Demo lab id on the deployment: `<id>`
- Admin: `<sau PR admin-ui>`

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

## Known limitations

- The JWT lives 8 hours and has no refresh. There is no server-side revocation; sign-out
  only clears the browser copy. The frontend keeps it in `localStorage`.
- There is no per-lab cap on model calls yet (planned: 800 calls per lab, FAQ-09).
- Students join a class with an invitation code, as in Google Classroom. Changing the code
  and removing a student are not available yet (PA4).
- UI problems moved to PA4: #4, #6/#16, #9, #10, #14, #15, #17, described in
  [docs/pa3/walkthrough.md](docs/pa3/walkthrough.md#moved-to-pa4).
