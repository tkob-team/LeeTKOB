# AGENTS.md

Rules for AI coding agents (Claude Code, Codex) working in this repository. This file is the single source; `CLAUDE.md` only imports it.

## Stack

- `backend/`: Java 25, Spring Boot 4.1 (modular monolith), Maven wrapper, PostgreSQL with Flyway migrations, JWT resource server (HS256). Tests use Testcontainers (Docker required).
- `checker/`: Python 3.12 only, managed with uv. Source in `src/checker/`, tests in `tests/`.
- Database: PostgreSQL only. No RAG, vector database, or model training.
- Run everything from a shell with JDK 25 selected (on Windows, inside WSL).

## Commands

Run from the repository root. Each command runs backend and checker and never modifies files.

```sh
make lint
make format-check
make typecheck
make test
```

- Fix formatting by hand: `cd backend && sh ./mvnw spotless:apply`, `cd checker && uv run --locked ruff format .`.
- Run all four before opening a PR. CI runs the same commands.

## Conventions

- Backend format: google-java-format via Spotless, Checkstyle fails on warnings. Checker: ruff (line length 100), mypy strict.
- Every change goes through a pull request. Fill in the PR template, including the AI-LOG question.
- Behaviour covered by `docs/contract/` must change together with the contract document and its tests.
- Add an entry to `AI-LOG.md` for AI-assisted work: tool, task, Kept, Changed, Rejected.
- Repository documentation is in English.
- Configuration comes from environment variables listed in `.env.example` (names only, no values).
- Verify the exact `make` entry points in the documented shell before claiming success: manual Git Bash commands passed while the WSL make run failed on missing uv/JDK 17 ([T01 incident record, b76ccd5](https://github.com/tkob-team/LeeTKOB/blob/b76ccd5/AI-LOG.md)).
- Pass permission-probe arguments as arrays, not an unquoted zsh string: word splitting produced incorrect results in T07 ([incident record, d4b4efd](https://github.com/tkob-team/LeeTKOB/blob/d4b4efde27f06ba091fdf43d3ccf4f3999532af5/AI-LOG.md#2026-11-10--t07-codex-permissions-and-trust-step-hoa)).

## Never

- Never put a secret (API key, JWT secret, password) in code, tests, logs, commits, or the sandbox that runs student code; real values live only in an untracked `.env`.
- Never call a real model from a unit test; use fakes or recorded responses.
- Never edit an existing test, expected output, eval dataset, or label to make a check pass. Fix the code. Adding new tests is fine.
- Never skip, disable, or weaken a check (lint, format, typecheck, test, secrets) or the `main` ruleset.
- Never push directly to `main`, force-push, or create release tags (`pa*`) unless the user asks.

## Permissions

Three policy levels apply to every agent. `.claude/settings.json` configures Claude Code's supported read/edit and shell permissions. Codex uses `.codex/config.toml` for workspace/network isolation and `.codex/rules/default.rules` for matching shell commands outside the sandbox (`allow`, `prompt`, `forbidden`). Project configuration must be trusted before it loads. Keep the policy and supported configuration in sync.

Shell prefix rules are not a universal file-access firewall. In particular, the checked-in Codex configuration does not enforce per-file edit approval or prevent every tool/interpreter from reading a secret inside the workspace. Those restrictions below remain agent instructions; keep real credentials outside the agent's accessible environment when hard isolation is needed. Do not claim a permission is runtime-enforced based only on syntax or a prefix probe. See `docs/pa2/agent-permissions.md` for coverage and limits.

**Allowed (no prompt)**
- Read files in the repository.
- Run the four `make` commands and `git status`, `git diff`, `git log`.
- Edit source, tests (adding or extending), and docs inside the repository.

**Ask first**
- Add or change dependencies (`pom.xml`, `pyproject.toml`, lockfiles).
- Edit `Makefile`, `.github/`, or database migrations.
- `git commit`, `git push`, creating or merging a pull request, Docker commands.
- Any command that needs network access or writes outside the repository.

**Never (policy; matching shell commands are blocked)**
- Read or edit `.env` or any file holding real secrets.
- Force-push, push to `main`, delete branches or tags.
- Edit eval data or labels; destructive commands such as `rm -rf`.
