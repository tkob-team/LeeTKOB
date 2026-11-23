# Checker image. The first argument picks the process (see docker-entrypoint.sh):
#   docker run leetkob-checker --data /data --out /out/predictions.jsonl   (checker command)
#   docker run leetkob-checker worker                                      (check_jobs worker)
# Dependencies are installed at build time, so the checker command runs with --network none.
# Only the worker receives GEMINI_API_KEY; the entrypoint removes it for the checker command.
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
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN uv sync --locked --no-dev \
    && chmod 0755 /usr/local/bin/docker-entrypoint.sh \
    && useradd --create-home --uid 10001 checker

USER checker
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
