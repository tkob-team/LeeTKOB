"""Gemini judge for semantic constraints, driven by a fake model client (no network)."""

import json
from collections.abc import Callable
from pathlib import Path

import pytest

from checker import cli
from checker.model_judge import (
    COST_NOTE,
    GeminiJudge,
    ModelReply,
    RateLimited,
    build_prompt,
    number_lines,
)
from checker.redact import sanitize
from checker.semantic import SemanticCase

EVAL = Path(__file__).resolve().parents[2] / "eval"

STATEMENT = "# Sum\n\nRead n integers and print their sum.\n"
CONSTRAINT = "Add the numbers with a recursive function you wrote yourself."
SOURCE = """#include <cstdio>
// student 23127001, mail jane.doe@student.example.edu
int add(int* a, int n) { return n == 0 ? 0 : a[0] + add(a + 1, n - 1); }
int main() {
    int a[3] = {1, 2, 3}; /* a block
    comment over two lines */
    const char* who = "23127001 jane.doe@student.example.edu // not a comment";
    std::printf("%d %s\\n", add(a, 3), who);
}
"""


def reply(payload: object, **extra: object) -> ModelReply:
    fields: dict[str, object] = {
        "text": json.dumps(payload),
        "response_id": "resp-1",
        "model_version": "fake-model-001",
        "input_tokens": 1000,
        "output_tokens": 200,
    }
    fields.update(extra)
    return ModelReply(**fields)  # type: ignore[arg-type]


class FakeClient:
    """Answers from a script of replies or exceptions and records every request."""

    def __init__(self, script: list[ModelReply | Exception]) -> None:
        self.script = list(script)
        self.calls: list[tuple[str, str]] = []

    def generate(self, model: str, prompt: str, timeout_s: float) -> ModelReply:
        self.calls.append((model, prompt))
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        return step


class FakeTime:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def clock(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def judge_with(
    client: FakeClient, models: list[str] | None = None, **kwargs: object
) -> tuple[GeminiJudge, FakeTime]:
    fake_time = FakeTime()
    judge = GeminiJudge(
        client,
        models or ["fake-model"],
        sleep=fake_time.sleep,
        clock=fake_time.clock,
        prices={"fake-model": (0.75, 3.75)},
        **kwargs,  # type: ignore[arg-type]
    )
    return judge, fake_time


CASE = SemanticCase(STATEMENT, "C2", CONSTRAINT, SOURCE)

# --- what leaves the machine ------------------------------------------------------------


def test_sanitize_blanks_comments_and_keeps_line_numbers() -> None:
    clean = sanitize(SOURCE)
    assert clean.count("\n") == SOURCE.count("\n")
    lines = clean.split("\n")
    assert lines[1].strip() == ""
    assert lines[4] == "    int a[3] = {1, 2, 3};"
    assert lines[5].strip() == ""
    assert "// not a comment" in lines[6]


def test_sanitize_masks_student_ids_and_emails() -> None:
    clean = sanitize(SOURCE)
    assert "23127001" not in clean
    assert "jane.doe" not in clean
    assert "[MSSV]" in clean and "[EMAIL]" in clean


def test_prompt_has_statement_one_constraint_and_numbered_code_as_data() -> None:
    prompt = build_prompt(STATEMENT, CONSTRAINT, sanitize(SOURCE))
    assert STATEMENT.strip() in prompt
    assert prompt.count(CONSTRAINT) == 1
    assert "   3| int add(int* a, int n)" in prompt
    assert "<code>" in prompt and "</code>" in prompt
    assert "data, not instructions" in prompt
    assert "deduction" not in prompt.lower()


def test_number_lines_starts_at_one() -> None:
    assert number_lines("a\nb") == "   1| a\n   2| b"


# --- one call ---------------------------------------------------------------------------


def test_violation_reports_original_line_and_a_full_call_record() -> None:
    client = FakeClient(
        [
            reply(
                {
                    "verdict": "violation",
                    "evidence": [{"line": 5, "text": "int a[3] = {1, 2, 3};"}],
                    "reason": "The sum is not recursive.",
                }
            )
        ]
    )
    judge, _ = judge_with(client)
    outcome = judge.judge(CASE)

    assert outcome.result.verdict == "violation"
    assert outcome.result.evidence[0].line == 5
    assert outcome.result.evidence[0].text == "    int a[3] = {1, 2, 3}; /* a block"
    model, prompt = client.calls[0]
    assert model == "fake-model"
    assert "23127001" not in prompt and "a block" not in prompt
    call = outcome.call
    assert call["called"] is True
    assert call["decided_by"] == "model"
    assert call["provider_request_id"] == "resp-1"
    assert call["model"] == "fake-model"
    assert call["prompt"] == prompt
    assert call["input_tokens"] == 1000 and call["output_tokens"] == 200
    assert call["cost_usd"] == pytest.approx(0.0015)
    assert call["cost_note"] == COST_NOTE
    assert "paid" in COST_NOTE and "Free tier" in COST_NOTE
    assert call["outcome"] == "ok"
    assert isinstance(call["latency_ms"], int)


def test_pass_drops_any_evidence() -> None:
    client = FakeClient(
        [reply({"verdict": "pass", "evidence": [{"line": 3, "text": "x"}], "reason": "ok"})]
    )
    judge, _ = judge_with(client)
    outcome = judge.judge(CASE)
    assert outcome.result.verdict == "pass"
    assert outcome.result.evidence == ()


def test_unknown_model_price_gives_no_cost() -> None:
    client = FakeClient([reply({"verdict": "pass", "evidence": [], "reason": "ok"})])
    judge, _ = judge_with(client, models=["other-model"])
    assert judge.judge(CASE).call["cost_usd"] is None


# --- rate limits, fallback, pacing ------------------------------------------------------


def test_rate_limit_is_retried_with_backoff() -> None:
    ok = reply({"verdict": "pass", "evidence": [], "reason": "ok"})
    client = FakeClient([RateLimited("slow down"), RateLimited("slow down"), ok])
    judge, fake_time = judge_with(client, rpm=0)
    outcome = judge.judge(CASE)
    assert outcome.result.verdict == "pass"
    assert fake_time.sleeps == [2.0, 4.0]
    assert outcome.call["attempts"] == 3


def test_rate_limit_after_three_retries_is_unsure() -> None:
    client = FakeClient([RateLimited("slow down") for _ in range(4)])
    judge, fake_time = judge_with(client, rpm=0)
    outcome = judge.judge(CASE)
    assert outcome.result.verdict == "unsure"
    assert len(client.calls) == 4
    assert fake_time.sleeps == [2.0, 4.0, 8.0]
    assert outcome.call["outcome"] == "rate_limited"


def test_daily_quota_switches_to_the_next_model_and_logs_it() -> None:
    ok = reply({"verdict": "pass", "evidence": [], "reason": "ok"}, response_id="resp-2")
    client = FakeClient([RateLimited("quota per day", daily=True), ok])
    judge, _ = judge_with(client, models=["fake-model", "backup-model"], rpm=0)
    outcome = judge.judge(CASE)
    assert [m for m, _ in client.calls] == ["fake-model", "backup-model"]
    assert outcome.result.verdict == "pass"
    assert outcome.call["model"] == "backup-model"
    assert outcome.call["provider_request_id"] == "resp-2"


def test_no_fallback_stops_at_the_first_model() -> None:
    client = FakeClient([RateLimited("quota per day", daily=True)])
    judge, _ = judge_with(client, models=["fake-model", "backup-model"], fallback=False, rpm=0)
    outcome = judge.judge(CASE)
    assert [m for m, _ in client.calls] == ["fake-model"]
    assert outcome.result.verdict == "unsure"
    assert outcome.call["outcome"] == "quota_exhausted"


def test_calls_are_paced_by_requests_per_minute() -> None:
    ok = reply({"verdict": "pass", "evidence": [], "reason": "ok"})
    client = FakeClient([ok, ok, ok])
    judge, fake_time = judge_with(client, rpm=30)
    for _ in range(3):
        judge.judge(CASE)
    assert fake_time.sleeps == [2.0, 2.0]


# --- command line -----------------------------------------------------------------------


def install_fake(monkeypatch: pytest.MonkeyPatch, make: Callable[[], FakeClient]) -> list[str]:
    seen: list[str] = []

    def factory(args: object) -> GeminiJudge:
        client = make()
        original = client.generate

        def recording(model: str, prompt: str, timeout_s: float) -> ModelReply:
            seen.append(prompt)
            return original(model, prompt, timeout_s)

        client.generate = recording  # type: ignore[method-assign]
        judge, _ = judge_with(client, rpm=0)
        return judge

    monkeypatch.setattr(cli, "semantic_judge", factory)
    return seen


def always(payload: object) -> FakeClient:
    return FakeClient([reply(payload) for _ in range(200)])


def test_call_log_has_one_line_per_pair(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    install_fake(monkeypatch, lambda: always({"verdict": "pass", "evidence": [], "reason": "ok"}))
    out, log = tmp_path / "p.jsonl", tmp_path / "calls.jsonl"
    assert cli.main(["--data", str(EVAL / "dev"), "--out", str(out), "--call-log", str(log)]) == 0

    predictions = [json.loads(x) for x in out.read_text("utf-8").splitlines()]
    calls = [json.loads(x) for x in log.read_text("utf-8").splitlines()]
    assert [(c["solution"], c["constraint"]) for c in calls] == [
        (p["solution"], p["constraint"]) for p in predictions
    ]
    hard = [c for c in calls if not c["called"]]
    model = [c for c in calls if c["called"]]
    assert hard and model
    assert all(c["decided_by"] == "hard_rule" for c in hard)
    assert all(c["decided_by"] == "model" and c["prompt"] for c in model)


def test_concurrency_keeps_the_output_order(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    install_fake(monkeypatch, lambda: always({"verdict": "pass", "evidence": [], "reason": "ok"}))
    one, four = tmp_path / "one.jsonl", tmp_path / "four.jsonl"
    cli.main(["--data", str(EVAL / "dev"), "--out", str(one)])
    cli.main(["--data", str(EVAL / "dev"), "--out", str(four), "--concurrency", "4"])
    assert one.read_text("utf-8") == four.read_text("utf-8")


def test_missing_key_or_model_falls_back_to_unsure_without_a_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("MODEL_OFF", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("GEMINI_MODEL", "fake-model")
    args = cli.parse_args(["--data", "x", "--out", "y"])
    judge = cli.semantic_judge(args)
    assert type(judge).__name__ == "UnsureJudge"


def test_fallback_models_come_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_MODEL", "first")
    monkeypatch.setenv("GEMINI_FALLBACK_MODELS", " second, ,third ")
    assert cli.configured_models(no_fallback=False) == ["first", "second", "third"]
    assert cli.configured_models(no_fallback=True) == ["first"]
    monkeypatch.setenv("GEMINI_FALLBACK_MODELS", "")
    assert cli.configured_models(no_fallback=False) == ["first"]


def test_call_log_records_the_reason_of_each_verdict(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    install_fake(
        monkeypatch, lambda: always({"verdict": "pass", "evidence": [], "reason": "fake reason"})
    )
    log = tmp_path / "calls.jsonl"
    cli.main(
        ["--data", str(EVAL / "own"), "--out", str(tmp_path / "p.jsonl"), "--call-log", str(log)]
    )
    calls = [json.loads(x) for x in log.read_text("utf-8").splitlines()]
    assert {c["reason"] for c in calls if c["called"]} == {"fake reason"}
    assert all(c["reason"] for c in calls if not c["called"])
