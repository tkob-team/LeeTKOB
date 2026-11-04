# LeetKOB

Monorepo:

- `backend/` — Spring Boot (Java 21, Maven wrapper)
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
