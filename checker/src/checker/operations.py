"""Private deployment dashboard and judge turnaround SLO monitor."""

from __future__ import annotations

import json
import sys
import threading
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import psycopg

from checker.worker import conninfo_from_env

TARGET = 0.95
INTERVAL_SECONDS = 30
_METRICS = """
with judge as (
  select extract(epoch from finished_at - enqueued_at) as seconds,
         extract(epoch from first_claimed_at - enqueued_at) as wait_seconds,
         grading_ms
  from judge_jobs where finished_at >= statement_timestamp() - interval '15 minutes'
), eligible as (
  select finished_at, enqueued_at from judge_jobs
  where enqueued_at <= statement_timestamp() - interval '30 seconds'
    and (enqueued_at >= statement_timestamp() - interval '15 minutes' or finished_at is null)
), model as (
  select latency_ms, estimated_cost_usd, outcome from checker_model_attempts
  where occurred_at >= statement_timestamp() - interval '15 minutes'
)
select
  (select count(*) from judge_jobs where finished_at is null
    and (lease_expires_at is null or lease_expires_at <= statement_timestamp())),
  (select count(*) from judge_jobs where finished_at is null
    and lease_expires_at > statement_timestamp()),
  (select count(*) from check_jobs where finished_at is null
    and (lease_expires_at is null or lease_expires_at <= statement_timestamp())),
  (select count(*) from check_jobs where finished_at is null
    and lease_expires_at > statement_timestamp()),
  (select count(*) from eligible),
  (select count(*) from eligible where finished_at <= enqueued_at + interval '30 seconds'),
  (select count(*) from eligible where finished_at is null),
  (select percentile_cont(0.95) within group (order by seconds) from judge),
  (select count(*) from model),
  (select percentile_cont(0.95) within group (order by latency_ms) / 1000 from model),
  (select sum(estimated_cost_usd) from model),
  (select count(*) from model where estimated_cost_usd is null),
  (select count(*) from model where outcome = 'timeout'),
  (select count(*) from judge_infrastructure_failures
    where occurred_at >= statement_timestamp() - interval '15 minutes'),
  (select percentile_cont(0.95) within group (order by wait_seconds) from judge),
  (select percentile_cont(0.95) within group (order by grading_ms) / 1000 from judge)
"""

Metric = int | float | None


class Monitor:
    def __init__(self, conninfo: dict[str, Any]) -> None:
        self._conninfo = conninfo
        self.metrics: dict[str, Metric] | None = None
        self.state = "unknown"
        self._alert_active = False

    def sample(self) -> None:
        with psycopg.connect(**{**self._conninfo, "connect_timeout": 5}) as connection:
            connection.execute("set transaction read only")
            connection.execute("set local statement_timeout = '5s'")
            row = connection.execute(_METRICS).fetchone()
        if row is None:
            return
        (
            judge_ready,
            judge_leased,
            check_ready,
            check_leased,
            eligible,
            fast,
            overdue,
            judge_p95,
            calls,
            model_p95,
            cost,
            missing_cost,
            model_timeouts,
            infrastructure_failures,
            wait_p95,
            grading_p95,
        ) = row
        ratio = fast / eligible if eligible else None
        self.metrics = {
            "judge_ready": judge_ready,
            "judge_leased": judge_leased,
            "check_ready": check_ready,
            "check_leased": check_leased,
            "judge_slo_eligible_15m": eligible,
            "judge_overdue_unfinished_15m": overdue,
            "judge_turnaround_p95_seconds_15m": judge_p95,
            "model_calls_15m": calls,
            "model_latency_p95_seconds_15m": model_p95,
            "model_estimated_cost_usd_15m": float(cost) if cost is not None else None,
            "model_attempts_without_cost_15m": missing_cost,
            "model_timeouts_15m": model_timeouts,
            "judge_infrastructure_failures_15m": infrastructure_failures,
            "judge_queue_wait_p95_seconds_15m": wait_p95,
            "judge_grading_p95_seconds_15m": grading_p95,
            "judge_slo_ratio_15m": ratio,
        }
        previous = self.state
        state = "no_data" if ratio is None else ("firing" if ratio < TARGET else "ok")
        self.state = state
        transition = None
        if state == "firing" and not self._alert_active:
            transition = "firing"
            self._alert_active = True
        elif state == "ok" and self._alert_active:
            transition = "resolved"
            self._alert_active = False
        if transition:
            self.log(
                "judge_turnaround_slo",
                transition=transition,
                state=state,
                previous=previous,
                ratio=ratio,
                jobs=eligible,
            )

    def sample_once(self) -> None:
        try:
            self.sample()
        except psycopg.Error as error:
            self.metrics = None
            if self.state != "unknown":
                self.log("operations_sample_failed", error_type=type(error).__name__)
            self.state = "unknown"

    def run(self, stop: threading.Event) -> None:
        while not stop.is_set():
            self.sample_once()
            stop.wait(INTERVAL_SECONDS)

    @staticmethod
    def log(event: str, **fields: object) -> None:
        print(
            json.dumps({"@timestamp": datetime.now(UTC).isoformat(), "event": event, **fields}),
            file=sys.stderr,
            flush=True,
        )


def handler_for(monitor: Monitor) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            metrics = monitor.metrics
            if self.path == "/metrics":
                if metrics is None:
                    self.respond(503, "text/plain", "Database sample unavailable\n")
                    return
                lines = [
                    f"leetkob_{key} {value}" for key, value in metrics.items() if value is not None
                ]
                self.respond(200, "text/plain", "\n".join(lines) + "\n")
            elif self.path == "/":
                rows = "".join(
                    f"<tr><th scope='row'>{key.replace('_', ' ')}</th>"
                    f"<td>{value if value is not None else 'No data'}</td></tr>"
                    for key, value in (metrics or {}).items()
                )
                self.respond(
                    200 if metrics is not None else 503,
                    "text/html",
                    "<!doctype html><html lang='en'><meta charset='utf-8'>"
                    "<meta http-equiv='refresh' content='30'>"
                    "<title>LeetKOB operations</title><h1>LeetKOB operations</h1>"
                    f"<p>Judge SLO of 95% within 30 seconds: {monitor.state}</p>"
                    "<p>Samples refresh every 30 seconds.</p>"
                    f"<table>{rows}</table></html>",
                )
            else:
                self.send_error(404)

        def respond(self, status: int, content_type: str, body: str) -> None:
            encoded = body.encode()
            self.send_response(status)
            self.send_header("Content-Type", content_type + "; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, format: str, *args: object) -> None:
            pass

    return Handler


def main() -> None:
    monitor = Monitor(conninfo_from_env())
    stop = threading.Event()
    with ThreadingHTTPServer(("0.0.0.0", 9108), handler_for(monitor)) as server:
        worker = threading.Thread(target=monitor.run, args=(stop,), daemon=True)
        worker.start()
        try:
            server.serve_forever()
        finally:
            stop.set()
            worker.join()


if __name__ == "__main__":
    main()
