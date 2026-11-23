"""check_jobs worker against PostgreSQL with the backend migrations (fake judge, no network)."""

import json
import os
import re
import time
import uuid
from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path

import psycopg
import pytest

from checker.model_judge import GeminiJudge, ModelReply
from checker.semantic import Judgement, SemanticCase
from checker.worker import CheckWorker, conninfo_from_env

MIGRATIONS = Path(__file__).resolve().parents[2] / "backend/src/main/resources/db/migration"
LEASE = timedelta(minutes=1)

BAN = "Do not call a library sort function: `std::sort`, `qsort`."
SEMANTIC = "Sort with a merge sort you wrote yourself."
CODE = """#include <algorithm>
// student note
int main() {
    int a[3] = {3, 1, 2};
    std::sort(a, a + 3);   // library call
    return a[0];
}
"""


def migration_version(path: Path) -> int:
    match = re.match(r"V(\d+)__", path.name)
    assert match is not None
    return int(match.group(1))


@pytest.fixture(scope="session")
def database() -> Iterator[dict[str, object]]:
    os.environ.setdefault("TESTCONTAINERS_RYUK_DISABLED", "true")
    from testcontainers.community.postgres import PostgresContainer

    with PostgresContainer("postgres:17-alpine", driver=None) as container:
        info: dict[str, object] = {
            "host": container.get_container_host_ip(),
            "port": int(container.get_exposed_port(5432)),
            "dbname": container.dbname,
            "user": container.username,
            "password": container.password,
        }
        with psycopg.connect(**info, autocommit=True) as conn:  # type: ignore[arg-type]
            for path in sorted(MIGRATIONS.glob("V*.sql"), key=migration_version):
                conn.execute(path.read_text(encoding="utf-8"))
        yield info


@pytest.fixture
def db(database: dict[str, object]) -> Iterator[psycopg.Connection[tuple[object, ...]]]:
    with psycopg.connect(**database, autocommit=True) as conn:  # type: ignore[arg-type]
        conn.execute("truncate model_calls, submissions, labs, classes, users cascade")
        yield conn


def seed(db: psycopg.Connection[tuple[object, ...]], code: str = CODE) -> uuid.UUID:
    student, klass, lab, submission = (uuid.uuid4() for _ in range(4))
    db.execute("insert into users (id) values (%s)", (student,))
    db.execute("insert into classes (id, name) values (%s, 'Worker test')", (klass,))
    db.execute(
        """
        insert into labs (id, class_id, opens_at, due_at, title, statement_md)
        values (%s, %s, now() - interval '1 day', now() + interval '1 day', 'Sort', %s)
        """,
        (lab, klass, "# Sort\nRead three numbers and print them sorted."),
    )
    db.execute(
        """
        insert into lab_constraints (lab_id, code, ordinal, text, deduction)
        values (%s, 'C1', 1, %s, 3), (%s, 'C2', 2, %s, 4)
        """,
        (lab, BAN, lab, SEMANTIC),
    )
    db.execute(
        """
        insert into submissions (id, lab_id, student_id, idempotency_key, code, size_bytes,
                                 submitted_at)
        values (%s, %s, %s, %s, %s, %s, now())
        """,
        (submission, lab, student, str(submission), code, len(code)),
    )
    db.execute(
        "insert into check_jobs (submission_id, enqueued_at) values (%s, now())", (submission,)
    )
    return submission


class RecordingClient:
    def __init__(self, text: str, delay_s: float = 0.0) -> None:
        self.text = text
        self.delay_s = delay_s
        self.prompts: list[str] = []

    def generate(self, model: str, prompt: str, timeout_s: float) -> ModelReply:
        self.prompts.append(prompt)
        if self.delay_s:
            time.sleep(self.delay_s)
        return ModelReply(self.text, "resp-42", "fake-001", 900, 80)


def violation_answer() -> str:
    return json.dumps(
        {
            "verdict": "violation",
            "evidence": [{"line": 5, "text": "std::sort(a, a + 3);"}],
            "reason": "uses a library sort",
        }
    )


def worker(database: dict[str, object], client: RecordingClient, **kw: float) -> CheckWorker:
    judge = GeminiJudge(client, ["fake-model"], rpm=0, timeout_s=kw.get("timeout_s", 30.0))
    return CheckWorker(database, judge, lease=LEASE)


def findings(db: psycopg.Connection[tuple[object, ...]], submission: uuid.UUID) -> list[tuple]:  # type: ignore[type-arg]
    return db.execute(
        """
        select constraint_code, verdict, source, evidence, reason, unsure_cause, model_call_id
        from findings where submission_id = %s order by constraint_code
        """,
        (submission,),
    ).fetchall()


def test_ac_job_writes_one_finding_per_constraint_and_finishes(
    database: dict[str, object], db: psycopg.Connection[tuple[object, ...]]
) -> None:
    submission = seed(db)
    client = RecordingClient(violation_answer())

    assert worker(database, client).run_once() == "completed"

    rows = findings(db, submission)
    assert [r[0] for r in rows] == ["C1", "C2"]
    c1, c2 = rows
    assert c1[1:3] == ("violation", "hard_rule")
    assert c1[3] == [{"line": 5, "text": "    std::sort(a, a + 3);   // library call"}]
    assert c1[6] is None
    assert c2[1:3] == ("violation", "model")
    assert c2[3] == [{"line": 5, "text": "    std::sort(a, a + 3);   // library call"}]
    call = db.execute(
        "select id, submission_id, provider_request_id, model, input_tokens, output_tokens, "
        "outcome from model_calls"
    ).fetchall()
    assert len(call) == 1
    assert call[0][0] == c2[6]
    assert call[0][1:] == (submission, "resp-42", "fake-model", 900, 80, "ok")
    finished = db.execute(
        "select finished_at is not null, lease_token is null from check_jobs "
        "where submission_id = %s",
        (submission,),
    ).fetchone()
    assert finished == (True, True)


def test_ban_list_pair_never_calls_the_model(
    database: dict[str, object], db: psycopg.Connection[tuple[object, ...]]
) -> None:
    seed(db)
    client = RecordingClient(violation_answer())
    worker(database, client).run_once()
    assert len(client.prompts) == 1
    assert SEMANTIC in client.prompts[0]
    assert BAN not in client.prompts[0]


def test_judge_timeout_is_an_unsure_guardrail_finding(
    database: dict[str, object], db: psycopg.Connection[tuple[object, ...]]
) -> None:
    submission = seed(db)
    client = RecordingClient(violation_answer(), delay_s=1.0)
    assert worker(database, client, timeout_s=0.05).run_once() == "completed"

    c2 = findings(db, submission)[1]
    assert c2[1:3] == ("unsure", "guardrail")
    assert c2[3] == []
    assert c2[5] == "timeout"
    outcome = db.execute("select outcome from model_calls where id = %s", (c2[6],)).fetchone()
    assert outcome == ("timeout",)


def test_running_twice_on_the_same_job_keeps_one_set_of_findings(
    database: dict[str, object], db: psycopg.Connection[tuple[object, ...]]
) -> None:
    submission = seed(db)
    client = RecordingClient(violation_answer())
    first = worker(database, client)
    claim = first.claim()
    assert claim is not None
    graded = first.grade(claim)

    assert first.complete(claim, graded) is True
    assert first.complete(claim, graded) is False
    assert worker(database, client).run_once() == "idle"
    assert len(findings(db, submission)) == 2
    assert db.execute("select count(*) from model_calls").fetchone() == (1,)


def test_existing_finding_is_never_replaced(
    database: dict[str, object], db: psycopg.Connection[tuple[object, ...]]
) -> None:
    submission = seed(db)
    db.execute(
        """
        insert into findings (submission_id, constraint_code, verdict, source, reason)
        values (%s, 'C2', 'pass', 'model', 'first writer')
        """,
        (submission,),
    )
    assert worker(database, RecordingClient(violation_answer())).run_once() == "completed"
    c2 = findings(db, submission)[1]
    assert c2[1] == "pass" and c2[4] == "first writer"


def test_expired_lease_lets_another_worker_take_the_job(
    database: dict[str, object], db: psycopg.Connection[tuple[object, ...]]
) -> None:
    submission = seed(db)
    client = RecordingClient(violation_answer())
    stale = worker(database, client)
    stale_claim = stale.claim()
    assert stale_claim is not None
    assert worker(database, client).claim() is None  # the lease is still live

    db.execute(
        "update check_jobs set lease_expires_at = now() where submission_id = %s", (submission,)
    )
    fresh = worker(database, client)
    assert fresh.run_once() == "completed"
    assert stale.complete(stale_claim, stale.grade(stale_claim)) is False
    assert len(findings(db, submission)) == 2
    assert db.execute("select count(*) from model_calls").fetchone() == (1,)


def test_no_job_means_idle(
    database: dict[str, object], db: psycopg.Connection[tuple[object, ...]]
) -> None:
    assert worker(database, RecordingClient(violation_answer())).run_once() == "idle"


def test_semantic_case_carries_no_submission_identity(
    database: dict[str, object], db: psycopg.Connection[tuple[object, ...]]
) -> None:
    submission = seed(db)
    seen: list[SemanticCase] = []

    class Spy:
        def judge(self, case: SemanticCase) -> Judgement:
            seen.append(case)
            return GeminiJudge(RecordingClient(violation_answer()), ["m"], rpm=0).judge(case)

    CheckWorker(database, Spy(), lease=LEASE).run_once()
    assert len(seen) == 1
    assert str(submission) not in repr(seen[0])


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        (
            "jdbc:postgresql://db.internal:5433/leetkob",
            {"host": "db.internal", "port": 5433, "dbname": "leetkob"},
        ),
        (
            "jdbc:postgresql://localhost/leetkob?sslmode=require",
            {"host": "localhost", "port": 5432, "dbname": "leetkob", "sslmode": "require"},
        ),
    ],
)
def test_backend_jdbc_url_is_translated(
    url: str, expected: dict[str, object], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DB_URL", url)
    monkeypatch.setenv("DB_USER", "checker")
    monkeypatch.setenv("DB_PASSWORD", "fake-password-for-test")
    assert conninfo_from_env() == {
        **expected,
        "user": "checker",
        "password": "fake-password-for-test",
    }


def test_non_jdbc_url_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DB_URL", "postgres://x/y")
    with pytest.raises(ValueError, match="jdbc:postgresql://"):
        conninfo_from_env()
