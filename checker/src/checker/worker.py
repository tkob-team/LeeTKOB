"""leetkob-check-worker: claim check_jobs, run the checker pipeline, write findings.

Queue rules follow docs/contract/internal-judge.md (FOR UPDATE SKIP LOCKED, lease token,
completion only under the live lease) and table ownership follows
docs/contract/pa3-boundaries.md (findings written once per pair with ON CONFLICT DO
NOTHING; model_calls never stores the prompt, the code or a key).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Literal
from urllib.parse import parse_qsl, urlsplit

import psycopg
from psycopg.types.json import Jsonb

from checker.cli import Constraint, Pair, decide, semantic_judge
from checker.semantic import Judgement, SemanticJudge

Outcome = Literal["idle", "completed", "lost"]
Source = Literal["hard_rule", "model", "guardrail"]

_CLAIM = """
with candidate as (
  select submission_id
  from check_jobs
  where finished_at is null
    and (lease_expires_at is null or lease_expires_at <= statement_timestamp())
  order by enqueued_at, submission_id
  limit 1
  for update skip locked
)
update check_jobs j
set lease_token = %(token)s,
    lease_expires_at = clock_timestamp() + %(millis)s * interval '1 millisecond'
from candidate c
join submissions s on s.id = c.submission_id
where j.submission_id = c.submission_id
returning j.submission_id, s.lab_id, s.code, j.lease_token
"""

# Lock the job row, then sample the clock: a lease that expired while waiting for the lock
# is rejected (same rule as judge_jobs).
_LOCK_LIVE_LEASE = """
select clock_timestamp() < lease_expires_at
from check_jobs
where submission_id = %(submission)s and lease_token = %(token)s and finished_at is null
for update
"""


@dataclass(frozen=True)
class Claim:
    submission_id: uuid.UUID
    lab_id: uuid.UUID
    code: str
    lease_token: uuid.UUID


@dataclass(frozen=True)
class Finding:
    constraint_code: str
    judgement: Judgement

    @property
    def source(self) -> Source:
        call = self.judgement.call
        if call.get("decided_by") == "hard_rule":
            return "hard_rule"
        if call.get("decided_by") == "model" and call.get("outcome") == "ok":
            return "model"
        return "guardrail"  # a limit, a failed call or no model turned the pair into unsure


def conninfo_from_env(env: Mapping[str, str] | None = None) -> dict[str, Any]:
    """psycopg connection settings from the backend's DB_URL (JDBC), DB_USER, DB_PASSWORD."""
    env = os.environ if env is None else env
    url = env.get("DB_URL", "").strip()
    if not url.startswith("jdbc:postgresql://"):
        raise ValueError("DB_URL must look like jdbc:postgresql://host:port/database")
    parts = urlsplit(url.removeprefix("jdbc:"))
    info: dict[str, Any] = {
        "host": parts.hostname or "localhost",
        "port": parts.port or 5432,
        "dbname": parts.path.lstrip("/"),
    }
    info.update(dict(parse_qsl(parts.query)))
    info["user"] = env.get("DB_USER", "")
    info["password"] = env.get("DB_PASSWORD", "")
    return info


class CheckWorker:
    def __init__(
        self, conninfo: Mapping[str, Any], judge: SemanticJudge, *, lease: timedelta
    ) -> None:
        if lease.total_seconds() * 1000 < 1:
            raise ValueError("the lease must be at least one millisecond")
        self._conninfo = dict(conninfo)
        self._judge = judge
        self._lease_ms = int(lease.total_seconds() * 1000)

    def _connect(self) -> psycopg.Connection[Any]:
        return psycopg.connect(**self._conninfo, autocommit=True)

    def claim(self) -> Claim | None:
        """Claim the oldest eligible job and commit the lease before any grading."""
        with self._connect() as conn:
            row = conn.execute(_CLAIM, {"token": uuid.uuid4(), "millis": self._lease_ms}).fetchone()
        if row is None:
            return None
        return Claim(row[0], row[1], row[2], row[3])

    def grade(self, claim: Claim) -> list[Finding]:
        """Run the CLI pipeline (hard rules first, then the semantic judge) outside any lock."""
        with self._connect() as conn:
            lab = conn.execute(
                "select statement_md from labs where id = %s", (claim.lab_id,)
            ).fetchone()
            constraints = conn.execute(
                "select code, text from lab_constraints where lab_id = %s order by ordinal, code",
                (claim.lab_id,),
            ).fetchall()
        statement = str(lab[0]) if lab is not None else ""
        found: list[Finding] = []
        for code, text in constraints:
            # The pair label stays local; SemanticCase never carries the submission id.
            pair = Pair("submission", Constraint(str(code), str(text)), statement, claim.code)
            found.append(Finding(str(code), decide(pair, self._judge)))
        return found

    def complete(self, claim: Claim, found: Sequence[Finding]) -> bool:
        """Write model_calls, findings and the job completion atomically under a live lease."""
        with self._connect() as conn, conn.transaction():
            live = conn.execute(
                _LOCK_LIVE_LEASE,
                {"submission": claim.submission_id, "token": claim.lease_token},
            ).fetchone()
            if live is None or not live[0]:
                return False
            for finding in found:
                call_id = self._insert_model_call(conn, claim.submission_id, finding)
                result = finding.judgement.result
                conn.execute(
                    """
                    insert into findings (submission_id, constraint_code, verdict, source,
                                          evidence, reason, unsure_cause, model_call_id)
                    values (%s, %s, %s, %s, %s, %s, %s, %s)
                    on conflict (submission_id, constraint_code) do nothing
                    """,
                    (
                        claim.submission_id,
                        finding.constraint_code,
                        result.verdict,
                        finding.source,
                        Jsonb([{"line": e.line, "text": e.text} for e in result.evidence]),
                        result.reason,
                        result.unsure_cause if result.verdict == "unsure" else None,
                        call_id,
                    ),
                )
            conn.execute(
                """
                update check_jobs
                set finished_at = clock_timestamp(), lease_token = null, lease_expires_at = null
                where submission_id = %s
                """,
                (claim.submission_id,),
            )
        return True

    @staticmethod
    def _insert_model_call(
        conn: psycopg.Connection[Any], submission: uuid.UUID, finding: Finding
    ) -> uuid.UUID | None:
        call = finding.judgement.call
        if call.get("called") is not True:
            return None
        call_id = uuid.uuid4()
        cost = call.get("cost_usd")
        conn.execute(
            """
            insert into model_calls (id, submission_id, provider_request_id, model, input_tokens,
                                     output_tokens, latency_ms, cost_usd, outcome)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                call_id,
                submission,
                call.get("provider_request_id"),
                str(call.get("model") or ""),
                _int(call.get("input_tokens")),
                _int(call.get("output_tokens")),
                _int(call.get("latency_ms")),
                cost if isinstance(cost, (int, float)) else 0,  # unknown price: no estimate
                str(call.get("outcome") or "unknown"),
            ),
        )
        return call_id

    def run_once(self) -> Outcome:
        claim = self.claim()
        if claim is None:
            return "idle"
        started = time.monotonic()
        found = self.grade(claim)
        outcome: Outcome = "completed" if self.complete(claim, found) else "lost"
        log = {
            "event": "check_job",
            "submission_id": str(claim.submission_id),
            "outcome": outcome,
            "findings": len(found),
            "model_calls": sum(1 for f in found if f.judgement.call.get("called") is True),
            "seconds": round(time.monotonic() - started, 3),
        }
        print(json.dumps(log), file=sys.stderr, flush=True)
        return outcome


def _int(value: object) -> int:
    return value if isinstance(value, int) else 0


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="leetkob-check-worker", description="Claim check_jobs and write findings."
    )
    parser.add_argument("--once", action="store_true", help="handle at most one job, then exit")
    parser.add_argument("--poll-seconds", type=float, default=2.0, help="wait when idle")
    parser.add_argument(
        "--lease-seconds",
        type=float,
        default=600.0,
        help="lease per job; longer than all model calls of one submission (default 600)",
    )
    parser.add_argument("--no-fallback", action="store_true", help="never use fallback models")
    parser.add_argument("--timeout", type=float, default=30.0, help="seconds per model call")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        conninfo = conninfo_from_env()
    except ValueError as error:
        print(f"leetkob-check-worker: {error}", file=sys.stderr)
        return 2
    judge = semantic_judge(argparse.Namespace(no_fallback=args.no_fallback, timeout=args.timeout))
    worker = CheckWorker(conninfo, judge, lease=timedelta(seconds=args.lease_seconds))
    while True:
        outcome = worker.run_once()
        if args.once:
            return 0
        if outcome == "idle":
            time.sleep(args.poll_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
