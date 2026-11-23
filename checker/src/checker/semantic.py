"""Interface for semantic constraints, which the model decides.

This module must stay free of network clients: MODEL_OFF=1 imports only this file.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from checker.hard_rules import RuleResult


@dataclass(frozen=True)
class SemanticCase:
    """Everything a judge may see for one (solution, constraint) pair.

    There is deliberately no solution id, file name or student identity here.
    """

    statement: str
    constraint_id: str
    constraint_text: str
    source: str


@dataclass(frozen=True)
class Judgement:
    """A verdict plus the call-log fields that describe how it was reached."""

    result: RuleResult
    call: dict[str, object] = field(default_factory=dict)


class SemanticJudge(Protocol):
    def judge(self, case: SemanticCase) -> Judgement: ...


class UnsureJudge:
    """Judge used when no model is configured or MODEL_OFF=1: never guesses."""

    def __init__(self, reason: str = "no model is configured") -> None:
        self._reason = reason

    def judge(self, case: SemanticCase) -> Judgement:
        return Judgement(
            RuleResult("unsure", (), self._reason),
            {"called": False, "decided_by": "no_model", "reason": self._reason},
        )
