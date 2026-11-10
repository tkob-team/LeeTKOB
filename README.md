# LeetKOB

Monorepo:

- `backend/` — Spring Boot (Java 25, Maven wrapper)
- `checker/` — Python 3.12 (uv)

## Prerequisites

- JDK 25
- [uv](https://docs.astral.sh/uv/)
- Docker (backend tests start PostgreSQL via Testcontainers)
- make

On Windows, use WSL and run everything from inside the WSL shell.

Copy `.env.example` to `.env` and fill in the values.

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


## Model and cost

The checker reviews accepted submissions against a lab's constraints with a Google
Gemini model. The model never decides a grade; a TA reviews every proposal.

| Item | Value |
| --- | --- |
| Provider | Google Gemini API |
| Initial model | `gemini-3.6-flash` (set with `GEMINI_MODEL`); the model comparison on the dev set may change it, and this section must then be updated |
| Key | `GEMINI_API_KEY`, held by one team member, stored only in the untracked `.env`, never committed. CI and unit tests use no key. |
| Spending limit | USD 20 per month, set in the provider console by the key holder. **Proposed value: not yet confirmed as set.** |
| Per-lab call cap | Planned, not implemented: 800 model calls per lab (twice the expected 400); beyond it verdicts become `unsure` (FAQ-09) |

### Cost of one lab

One model call per counted submission and constraint. Worst case from the brief: 80
students and 5 constraints, so 400 calls.

Assumptions per call, not yet measured: 2,000 input tokens (statement, constraint, code) and
1,500 output tokens (JSON verdict plus thinking tokens, which are billed as output).

| Prices (USD per 1M tokens, input / output) | One pass | With 2x retries and re-reviews |
| --- | --- | --- |
| 0.75 / 3.75 (until 2026-12-31) | USD 2.85 | USD 5.70 |
| 1.50 / 7.50 (from 2027-01-01) | USD 5.70 | USD 11.40 |

Prices are from the [Gemini API pricing page](https://ai.google.dev/gemini-api/docs/pricing),
read on 2026-11-10; the page gives no update date, so re-check before relying on them. At
the proposed limit of USD 20 per month, the post-2026 worst case allows about one lab per
month with retries, or three without. Replace the token assumptions with measured values
after the model trial.
