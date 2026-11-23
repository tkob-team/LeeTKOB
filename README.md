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

## PA#03 judge preview

- Review the [Docker prototype and timings](docs/decisions/0002-docker-judge-prototype.md).
- In the frontend, sign in as Student through the mock login and open Nop bai to try the submission form and sample per-test verdicts. This preview runs in the browser with a fixed lab and fixed results.
- To measure submission receipt latency, use a disposable local test lab. Set `LEETKOB_LOAD_TOKEN` to the student's JWT and `LEETKOB_LAB_ID` to the lab UUID in your shell. The script sends one unique idempotency key per submission and reports receipt p50 and p95 for successful HTTP 201 responses.

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
Gemini model. The model never decides a grade; a TA reviews every proposal.

| Item | Value |
| --- | --- |
| Provider | Google Gemini API |
| Initial model | `gemini-3.6-flash` (set with `GEMINI_MODEL`); the model comparison on the dev set may change it, and this section must then be updated |
| Key | `leetkob-pa02`, created on 2026-11-10 in Google AI Studio project `LeeTKOB` (`gen-lang-client-0403299997`). The holder can copy it from AI Studio into their private `GEMINI_API_KEY`; its value was not copied into this repo, logs or chat. CI and unit tests use no key. |
| Spending control | **Hard cap of USD 0:** the key's Google project has no billing account, so it cannot be charged. Free tier only, as explicitly requested by Hoang; no paid plan, payment method or USD 20/month spending cap was enabled. Enabling billing needs a new team decision. |
| Per-lab call cap | Planned, not implemented: 800 model calls per lab (twice the expected 400); beyond it verdicts become `unsure` (FAQ-09) |

### Cost of one lab

The selected operating mode is Free tier: supported free-tier calls within quota
have no billed token cost. This does not guarantee that a full 400-call lab fits
the free quotas or that every model is available in this tier. No real model call
or quota-capacity test was made while provisioning the key. See the
[masked account evidence](docs/pa2/t12-free-tier.md).

The paid-pricing estimate below is retained for comparison only; it is not the
active billing configuration or a spend cap that has been set.

One model call per counted submission and constraint. Worst case from the brief: 80
students and 5 constraints, so 400 calls.

Assumptions per call, not yet measured: 2,000 input tokens (statement, constraint, code) and
1,500 output tokens (JSON verdict plus thinking tokens, which are billed as output).

| Prices (USD per 1M tokens, input / output) | One pass | With 2x retries and re-reviews |
| --- | --- | --- |
| 0.75 / 3.75 (until 2026-12-31) | USD 2.85 | USD 5.70 |
| 1.50 / 7.50 (from 2027-01-01) | USD 5.70 | USD 11.40 |

Prices are from the [Gemini API pricing page](https://ai.google.dev/gemini-api/docs/pricing),
read on 2026-11-10; the page gives no update date, so re-check before relying on them.
The earlier USD 20/month proposal was replaced by the user's Free-tier-only
decision. Replace the token assumptions with measured values after the model trial.

## Class management (T29)

Administrators can create classes and assign existing TA accounts; students join
with an invitation code. Class lists, details and rosters enforce class membership.
See the [class API contract](docs/contract/classes.md) for endpoints and role rules.
Account/password login and production JWT issuance remain T28; this feature uses
the existing JWT verifier and persisted account roles.
