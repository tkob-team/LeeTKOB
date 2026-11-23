"""Identity masking is limited to literals, and the paid-price table holds the used models."""

import pytest

from checker.model_judge import PRICES_USD_PER_MTOK, GeminiJudge, ModelReply
from checker.redact import sanitize
from checker.semantic import SemanticCase


def test_numeric_constants_in_code_are_not_masked() -> None:
    code = "const int N = 10000000;\nint a[N + 5];\nlong long M = 12345678LL;\n"
    assert sanitize(code) == code.rstrip("\n") + "\n"


def test_ids_and_emails_are_masked_inside_string_and_char_literals_only() -> None:
    code = (
        'const char* who = "22120345 <a.student@uni.example.edu>";\n'
        'const char* raw = R"(id 21127001)";\n'
        "int id = 22120345;\n"
    )
    lines = sanitize(code).split("\n")
    assert lines[0] == 'const char* who = "[MSSV] <[EMAIL]>";'
    assert lines[1] == 'const char* raw = R"(id [MSSV])";'
    assert lines[2] == "int id = 22120345;"


def test_id_in_a_comment_disappears_with_the_comment() -> None:
    assert sanitize("int x = 1; // 22120345 a@b.example.com\n") == "int x = 1;\n"


def test_price_table_has_the_paid_prices_of_the_configured_models() -> None:
    assert PRICES_USD_PER_MTOK["gemini-3.5-flash-lite"] == (0.30, 2.50)
    assert PRICES_USD_PER_MTOK["gemini-3.1-flash-lite"] == (0.25, 1.50)


def test_cost_uses_the_default_price_table() -> None:
    class Client:
        def generate(self, model: str, prompt: str, timeout_s: float) -> ModelReply:
            return ModelReply(
                '{"verdict":"pass","evidence":[],"reason":"ok"}', "r", None, 2000, 400
            )

    judge = GeminiJudge(Client(), ["gemini-3.5-flash-lite"], rpm=0)
    call = judge.judge(SemanticCase("s", "C2", "c", "int main() {}\n")).call
    assert call["cost_usd"] == pytest.approx((2000 * 0.30 + 400 * 2.50) / 1e6)
