# LeetKOB

Monorepo:

- `backend/` — Spring Boot (Java 25, Maven wrapper)
- `checker/` — Python 3.12 (uv)
- `frontend/` — React + Vite + TypeScript (Node.js 22); UI from `docs/design-system/`

## Prerequisites

- JDK 25
- [uv](https://docs.astral.sh/uv/)
- Docker (backend tests start PostgreSQL via Testcontainers)
- make
- Node.js 22 (`frontend/.nvmrc`); run `cd frontend && npm ci` once before the checks

On Windows, use WSL and run everything from inside the WSL shell.

Select JDK 25 before running checks (`java -version` must report 25). On macOS,
select that installed JDK for the current shell; on Windows use the WSL toolchain.
Run `uv --version` and `docker info` to confirm uv and the Docker daemon are available.

The four checks need no real credentials or `.env`: Testcontainers supplies the
database and tests use a fake JWT signing key. `uv run --locked` creates the checker
environment from its lockfile. A first run needs network access for dependencies.

For running the application, copy `.env.example` to an untracked `.env` and fill it
privately. Spring Boot does not automatically load a shell `.env` file: export the
listed variables into the application process using your own launcher or IDE.
Never ask an agent to read that file. The model key is not needed for PA#02 tests.

## Checks

```sh
make lint
make format-check
make typecheck
make test
```

## Continuous integration

`.github/workflows/ci.yml` runs on pull requests, pushes to `main`, and pushed
tags matching `pa*` (including `pa2`). It also supports manual runs.

The five check names are `lint`, `format-check`, `typecheck`, `test`, and
`secrets`. The first four execute the exact Makefile commands above with
JDK 25, Python 3.12, and uv 0.13.7. Backend tests start PostgreSQL through
Testcontainers using Docker on the runner. Contract tests added to the backend
test suite run in the same `make test` job.

The `secrets` job checks out all branches and tags and runs Gitleaks 8.30.1 over
the full Git history. Its release archive is checksum-verified, findings are
redacted, and a detected secret fails the job. No model API key is needed for CI.

These five check names are intended for the `main` protection ruleset (T03).
Adding this workflow alone does not configure branch protection. LLM evaluation
is not a required check for PA#02.

## AI agent permissions

Agent rules are in `AGENTS.md`. Claude Code reads `.claude/settings.json`; Codex
reads `.codex/config.toml` and `.codex/rules/`.

Codex only loads the project-level `.codex/` files after you trust the project.
Every developer must do this once on their own machine: open the repository in
Codex and choose to trust the project when prompted (or mark it as `trusted`
under `[projects."<path to this repository>"]` in `~/.codex/config.toml`).
Without it, Codex ignores the permissions in this repository and falls back to
your personal defaults.

To check a command against the rules:

```sh
codex execpolicy check --rules .codex/rules/default.rules -- git push --force origin x
```

Run `python3 scripts/check-agent-permissions.py` for the reproducible command
matrix. See [permission coverage](docs/pa2/agent-permissions.md) for what is
runtime-enforced and what remains agent policy; prefix checks do not establish
interactive enforcement or universal secret-file isolation.

## PA#02 evidence

See [PA2.md](PA2.md) for the evidence links and remaining release-tag step.
The [PostgreSQL queue ADR](docs/decisions/0001-postgresql-judge-queue.md) records
T27. See the [internal judge contract](docs/contract/internal-judge.md) for the
queue, worker and recovery rules.

## PA#03 submission and judge

Build the trusted sandbox image on the Linux Docker daemon that the judge worker uses.
The daemon must provide cgroup v2 with CPU, memory, swap and PID accounting.

```sh
docker build -t leetkob-sandbox:pa3 sandbox
(cd backend && sh ./mvnw -B -ntp package)
java -jar backend/target/backend-0.0.1-SNAPSHOT.jar judge-worker
```

The HTTP API uses the same jar without the `judge-worker` argument. Run them as
separate processes against the same PostgreSQL database. The judge worker needs the
Docker CLI and permission to talk to its daemon. In a deployment, mount the Docker
socket only in the judge worker service. Its sandbox containers receive neither the
socket nor the service environment. `JUDGE_SANDBOX_IMAGE` can select a trusted image
already available to that daemon.

The `sandbox` job runs on PRs, `main`, and the `pa3` tag. Reproduce its nine sandbox
checks and the worker restart test after building the image.

```sh
(cd backend && JUDGE_SANDBOX_TESTS=1 sh ./mvnw -B -ntp \
  -Dtest=DockerSandboxTest,JudgeWorkerRestartTest test)
```

Students select a lab from their class and see the latest submission in the
[student polling contract](docs/contract/get-student-judge-status.md). The frontend
needs the authenticated API routes on its origin or through the configured API base URL.
For the original trusted-sample baseline, see the
[Docker prototype timings](docs/decisions/0002-docker-judge-prototype.md).

The local receipt script measures HTTP receipt latency. Set `LEETKOB_LOAD_TOKEN` to a
fixture student's JWT and `LEETKOB_LAB_ID` to its lab UUID in your shell.

```sh
node scripts/submission-load.mjs --url http://127.0.0.1:8080 --lab "$LEETKOB_LAB_ID" --count 8 --concurrency 4
```

## Checker command

One command reads a dataset folder (layout in [eval/dev/README.md](eval/dev/README.md)) and
writes one prediction line per (solution, constraint). It reads only each problem's
`statement.md` and `constraints.json`; there is no per-problem configuration. Ban-list
constraints ("Do not use" / "Do not call") go to the syntax-tree hard rules; semantic
constraints go to the Gemini judge (`checker/src/checker/model_judge.py`). Without
`GEMINI_API_KEY` and `GEMINI_MODEL` they are `unsure`.

```sh
cd checker && uv run leetkob-check --data ../eval/dev --out ../out/predictions.jsonl
```

Before a call, comments are replaced by spaces (line numbers stay the same) and 8-digit
student IDs and email addresses are masked; no solution id, file name or identity is sent.
The model answers JSON (`verdict`, `evidence`, `reason`; no deduction field), checked again
locally. Options: `--call-log <file>` writes one line per pair (hard rule or model call,
with response id, model, prompt, tokens, latency and a cost estimate at paid-tier prices
although calls run on the Free tier); `--concurrency N` (default 1); `--timeout S` (default
30); `--no-fallback` uses only `GEMINI_MODEL` (use it for dev-set runs that are committed).
`GEMINI_FALLBACK_MODELS` is a comma-separated list tried in order after a daily-quota 429;
other 429s are retried 3 times with backoff and then give `unsure`. `GEMINI_RPM` paces the
calls (default 15 per minute).

`MODEL_OFF=1` runs the hard rules only: semantic constraints are `unsure` and no network
client is imported or created. Docker image (dependencies are installed at build time, so
the run needs no network):

```sh
docker build -t leetkob-checker checker
docker run --rm --network none --memory 1g --pids-limit 256 -e MODEL_OFF=1 \
  -v "$PWD/eval/dev:/data:ro" -v "$PWD/out:/out" \
  leetkob-checker --data /data --out /out/predictions.jsonl
```

Score the file with the lecturer's scorer. Exit 0 means every threshold is met, 1 means a
threshold failed, 2 means the file is invalid:

```sh
node eval/dev/eval.mjs --data eval/dev --predictions out/predictions.jsonl
```

Our own cases live in `eval/own/` (same layout, new problems); score them with
`--data eval/own`. Never edit `eval/dev/`: it is a byte-for-byte copy of the lecturer's set.

## Model and cost

The checker reviews accepted submissions against a lab's constraints with a Google
Gemini model. The model never decides a grade or a deduction; a TA reviews every proposal.

| Item | Value |
| --- | --- |
| Provider | Google Gemini API |
| Model in use | `gemini-3.5-flash-lite` (set with `GEMINI_MODEL`); `GEMINI_FALLBACK_MODELS` may list `gemini-3.1-flash-lite` for daily-quota fallback, but committed dev-set runs use `--no-fallback` |
| Key | `leetkob-pa02`, created on 2026-11-10 in Google AI Studio project `LeeTKOB` (`gen-lang-client-0403299997`). The holder keeps it in their private `GEMINI_API_KEY`; its value was not copied into this repo, logs or chat. CI and unit tests use no key. |
| Real cost | **USD 0.** The key's Google project has no billing account, so calls run on the Free tier and cannot be charged. Enabling billing needs a new team decision. |
| Per-lab call cap | Planned, not implemented: 800 model calls per lab; beyond it verdicts become `unsure` (FAQ-09) |

### Measured tokens and the cost of one lab

Measured on the committed dev-set run
[`eval/runs/2026-11-23-gemini-3.5-flash-lite/calls.jsonl`](eval/runs/2026-11-23-gemini-3.5-flash-lite/calls.jsonl):
47 model calls (one per semantic pair; ban-list pairs never call the model), average
**944.9 input tokens** and **74.6 output tokens** per call (output includes thinking tokens).

Paid-tier prices, used only as an estimate (USD per 1M tokens, Standard, input / output):
`gemini-3.5-flash-lite` 0.30 / 2.50 and `gemini-3.1-flash-lite` 0.25 / 1.50, from the
[Gemini API pricing page](https://ai.google.dev/gemini-api/docs/pricing) read on 2026-11-23.

Average estimated cost of one call = (944.9 × 0.30 + 74.6 × 2.50) / 1,000,000 = USD 0.00047
(mean of the logged `cost_usd`: USD 0.00046994).

One lab: 80 submissions × 2 semantic constraints (assumption) × USD 0.00046994
= 160 calls × USD 0.00046994 = **USD 0.075** at paid-tier prices. The real cost is USD 0
because the Free tier is used. 160 calls fit the 500-request daily quota of the key; at the
default 15 requests per minute they take about 11 minutes.

## Class management (T29)

Administrators can create classes and assign existing TA accounts; students join
with an invitation code. Class lists, details and rosters enforce class membership.
See the [class API contract](docs/contract/classes.md) for endpoints and role rules.
Account/password login and production JWT issuance remain T28; this feature uses
the existing JWT verifier and persisted account roles.
