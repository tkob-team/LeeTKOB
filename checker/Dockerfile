# Checker image: runs `leetkob-check --data <dataset> --out <file.jsonl>`.
# Dependencies are installed at build time, so the container runs with --network none.
FROM ghcr.io/astral-sh/uv:0.13.7 AS uv

FROM python:3.12-slim-bookworm
COPY --from=uv /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev \
    && useradd --create-home --uid 10001 checker

USER checker
ENTRYPOINT ["/app/.venv/bin/leetkob-check"]
