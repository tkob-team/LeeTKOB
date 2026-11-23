"""Model answers outside the limits become unsure with a cause (fake model, no network)."""

import json
import time
from pathlib import Path

import pytest

from checker import cli
from checker.hard_rules import banned_names
from checker.model_judge import GeminiJudge, ModelReply
from checker.semantic import SemanticCase

EVAL = Path(__file__).resolve().parents[2] / "eval"

SOURCE = """#include <cstdio>
// written by 23127042 for the lab
int total(int n) {
    int s = 0;   /* running sum */
    for (int i = 1; i <= n; ++i) s += i;
    return s;
}
int main() { std::printf("%d\\n", total(5)); }
"""
CASE = SemanticCase("Print 1 + ... + n.", "C2", "Use recursion you wrote yourself.", SOURCE)


class ScriptedClient:
    def __init__(self, text: str, delay_s: float = 0.0) -> None:
        self.text = text
        self.delay_s = delay_s
        self.prompts: list[str] = []

    def generate(self, model: str, prompt: str, timeout_s: float) -> ModelReply:
        self.prompts.append(prompt)
        if self.delay_s:
            time.sleep(self.delay_s)
        return ModelReply(self.text, "resp-x", "fake-001", 10, 5)


def run(
    text: str, *, delay_s: float = 0.0, timeout_s: float = 30.0
) -> tuple[GeminiJudge, ScriptedClient]:
    client = ScriptedClient(text, delay_s=delay_s)
    return GeminiJudge(client, ["fake-model"], rpm=0, timeout_s=timeout_s), client


def answer(verdict: str, evidence: list[dict[str, object]], **extra: object) -> str:
    return json.dumps({"verdict": verdict, "evidence": evidence, "reason": "r", **extra})


def assert_unsure(text: str, cause: str, *, delay_s: float = 0.0, timeout_s: float = 30.0) -> None:
    judge, _ = run(text, delay_s=delay_s, timeout_s=timeout_s)
    outcome = judge.judge(CASE)
    assert outcome.result.verdict == "unsure"
    assert outcome.result.evidence == ()
    assert outcome.result.unsure_cause == cause
    assert outcome.call["unsure_cause"] == cause


# --- schema -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        answer("violation", [{"line": 5, "text": "x"}], deduction=3),
        answer("pass", [], score=10),
        answer("pass", [{"line": 5, "text": "x", "severity": "high"}]),
        answer("guilty", []),
        answer("pass", [{"line": "5", "text": "x"}]),
        answer("pass", [{"line": 0, "text": "x"}]),
        json.dumps({"verdict": "pass", "evidence": []}),
        '{"verdict": "pass", "evidence": [], "reason": "cut off',
        "not json at all",
        "",
    ],
)
def test_output_outside_the_schema_is_unsure_schema(text: str) -> None:
    assert_unsure(text, "schema")


# --- timeout ----------------------------------------------------------------------------


def test_slow_model_is_unsure_timeout() -> None:
    started = time.monotonic()
    assert_unsure(answer("pass", []), "timeout", delay_s=1.0, timeout_s=0.05)
    assert time.monotonic() - started < 0.9


def test_client_timeout_error_is_unsure_timeout() -> None:
    class TimingOut:
        def generate(self, model: str, prompt: str, timeout_s: float) -> ModelReply:
            raise TimeoutError("read timed out")

    outcome = GeminiJudge(TimingOut(), ["fake-model"], rpm=0).judge(CASE)
    assert outcome.result.unsure_cause == "timeout"


def test_timeout_default_is_thirty_seconds() -> None:
    assert cli.parse_args(["--data", "d", "--out", "o"]).timeout == 30.0
    assert cli.parse_args(["--data", "d", "--out", "o", "--timeout", "5"]).timeout == 5.0


# --- evidence ---------------------------------------------------------------------------


def test_matching_evidence_reports_the_original_line() -> None:
    judge, _ = run(answer("violation", [{"line": 4, "text": "  int s = 0;  "}]))
    outcome = judge.judge(CASE)
    assert outcome.result.verdict == "violation"
    assert outcome.result.unsure_cause is None
    assert [(e.line, e.text) for e in outcome.result.evidence] == [
        (4, "    int s = 0;   /* running sum */")
    ]


def test_evidence_quoting_a_comment_does_not_match_the_clean_line() -> None:
    assert_unsure(
        answer("violation", [{"line": 4, "text": "int s = 0;   /* running sum */"}]), "evidence"
    )


@pytest.mark.parametrize(
    "evidence",
    [
        [{"line": 5, "text": "while (true) s += i;"}],
        [{"line": 99, "text": "for (int i = 1; i <= n; ++i) s += i;"}],
        [
            {"line": 5, "text": "for (int i = 1; i <= n; ++i) s += i;"},
            {"line": 6, "text": "invented line"},
        ],
    ],
)
def test_evidence_that_does_not_match_the_code_is_unsure_evidence(
    evidence: list[dict[str, object]],
) -> None:
    assert_unsure(answer("violation", evidence), "evidence")


def test_violation_without_evidence_is_unsure() -> None:
    assert_unsure(answer("violation", []), "evidence")


def test_model_unsure_keeps_cause_model() -> None:
    assert_unsure(answer("unsure", []), "model")


# --- what the model receives, and what never reaches it ---------------------------------


def test_prompt_received_has_no_comments_and_no_student_id() -> None:
    judge, client = run(answer("pass", []))
    judge.judge(CASE)
    (prompt,) = client.prompts
    assert "23127042" not in prompt
    assert "written by" not in prompt and "running sum" not in prompt
    assert "/*" not in prompt and "//" not in prompt
    assert "   5| " in prompt and "for (int i = 1; i <= n; ++i) s += i;" in prompt


def test_ban_list_pairs_never_reach_the_model(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    client = ScriptedClient(answer("pass", []))
    monkeypatch.setattr(
        cli, "semantic_judge", lambda args: GeminiJudge(client, ["fake-model"], rpm=0)
    )
    cli.main(["--data", str(EVAL / "dev"), "--out", str(tmp_path / "p.jsonl")])

    semantic = ban_list = 0
    for problem in (EVAL / "dev" / "problems").iterdir():
        solutions = len(list((EVAL / "dev" / "solutions" / problem.name).glob("*.cpp")))
        for c in json.loads((problem / "constraints.json").read_text("utf-8")):
            if banned_names(c["text"]) is None:
                semantic += solutions
            else:
                ban_list += solutions
                assert not any(c["text"] in p for p in client.prompts)
    assert ban_list > 0
    assert len(client.prompts) == semantic
