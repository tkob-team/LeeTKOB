"""Interface for semantic constraints, which the model decides.

This module must stay free of network clients: MODEL_OFF=1 imports only this file.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from checker.hard_rules import RuleResult


@dataclass(frozen=True)
class SemanticCase:
    """Everything a judge may see for one (solution, constraint) pair."""

    statement: str
    constraint_id: str
    constraint_text: str
    source: str


class SemanticJudge(Protocol):
    def judge(self, case: SemanticCase) -> RuleResult: ...


class UnsureJudge:
    """Judge used when no model is configured or MODEL_OFF=1: never guesses."""

    def __init__(self, reason: str = "no model is configured") -> None:
        self._reason = reason

    def judge(self, case: SemanticCase) -> RuleResult:
        return RuleResult("unsure", (), self._reason)
