#!/bin/sh
# Choose the process with the first argument:
#   worker [options]   leetkob-check-worker (the only process that receives GEMINI_API_KEY)
#   check [options]    leetkob-check
#   [options]          leetkob-check (default, so `--data ... --out ...` keeps working)
set -eu
case "${1:-}" in
  worker)
    shift
    exec /app/.venv/bin/leetkob-check-worker "$@"
    ;;
  check)
    shift
    ;;
esac
if [ -n "${GEMINI_API_KEY:-}" ]; then
  echo "leetkob-check: GEMINI_API_KEY is ignored here; only the worker receives it" >&2
fi
unset GEMINI_API_KEY
exec /app/.venv/bin/leetkob-check "$@"
