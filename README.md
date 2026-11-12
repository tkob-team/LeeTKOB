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
T27; workers and sandbox execution remain later tasks.

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
