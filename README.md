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
