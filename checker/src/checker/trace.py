"""Emit allowlisted worker events under a submission and constraint context."""

import json
import sys
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager, suppress
from contextvars import ContextVar
from datetime import UTC, datetime

_context: ContextVar[dict[str, str] | None] = ContextVar("checker_trace", default=None)
_model_observer: ContextVar[Callable[[dict[str, object]], None] | None] = ContextVar(
    "model_observer", default=None
)


@contextmanager
def trace_constraint(submission_id: str, constraint_code: str) -> Iterator[None]:
    previous = _context.get() or {}
    token = _context.set(
        {**previous, "submission_id": submission_id, "constraint_code": constraint_code}
    )
    try:
        yield
    finally:
        _context.reset(token)


@contextmanager
def trace_submission(
    submission_id: str, model_observer: Callable[[dict[str, object]], None]
) -> Iterator[None]:
    token = _context.set({"submission_id": submission_id, "attempt_id": str(uuid.uuid4())})
    observed = _model_observer.set(model_observer)
    try:
        yield
    finally:
        _model_observer.reset(observed)
        _context.reset(token)


def log_event(event: str, *, level: str = "INFO", **fields: object) -> None:
    context = _context.get()
    if context is None and "submission_id" not in fields:
        return
    entry = {
        "@timestamp": datetime.now(UTC).isoformat(),
        "level": level,
        "service": "checker-worker",
        "event": event,
        **(context or {}),
        **fields,
    }
    observer = _model_observer.get()
    if observer is not None and event == "model_attempt":
        observer(entry)
    # Telemetry failure must not invalidate a grading result.
    with suppress(OSError):
        print(json.dumps(entry), file=sys.stderr, flush=True)
