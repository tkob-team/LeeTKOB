"""leetkob-check: write one prediction line per (solution, constraint) of a dataset folder.

The dataset layout is the one in eval/dev/README.md. Only statement.md and constraints.json
are read for each problem; there is no per-problem configuration.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path

from checker.hard_rules import RuleResult, check
from checker.semantic import SemanticCase, SemanticJudge, UnsureJudge


@dataclass(frozen=True)
class Constraint:
    id: str
    text: str


def model_off() -> bool:
    return os.environ.get("MODEL_OFF", "").strip() == "1"


def semantic_judge() -> SemanticJudge:
    """The judge for semantic constraints. MODEL_OFF=1 never loads a network client."""
    if model_off():
        return UnsureJudge("MODEL_OFF=1: semantic constraints are not checked")
    # The model judge is added in a later change; until then nothing is called.
    return UnsureJudge()


def load_constraints(problem: Path) -> list[Constraint]:
    raw = json.loads((problem / "constraints.json").read_text(encoding="utf-8"))
    return [Constraint(str(item["id"]), str(item["text"])) for item in raw]


def predictions(data: Path, judge: SemanticJudge) -> Iterator[dict[str, object]]:
    for problem in sorted(p for p in (data / "problems").iterdir() if p.is_dir()):
        statement_file = problem / "statement.md"
        statement = statement_file.read_text(encoding="utf-8") if statement_file.exists() else ""
        constraints = load_constraints(problem)
        for solution in sorted((data / "solutions" / problem.name).glob("*.cpp")):
            source = solution.read_text(encoding="utf-8", errors="replace")
            for constraint in constraints:
                result = check(source, constraint.text)
                if result is None:
                    result = _judge_safely(
                        judge, SemanticCase(statement, constraint.id, constraint.text, source)
                    )
                yield {
                    "solution": f"{problem.name}/{solution.stem}",
                    "constraint": constraint.id,
                    "verdict": result.verdict,
                    "evidence": [{"line": e.line, "text": e.text} for e in result.evidence],
                }


def _judge_safely(judge: SemanticJudge, case: SemanticCase) -> RuleResult:
    try:
        return judge.judge(case)
    except Exception as error:  # a failing judge must never become a deduction
        return RuleResult("unsure", (), f"semantic judge failed: {type(error).__name__}")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="leetkob-check", description="Check every (solution, constraint) of a dataset."
    )
    parser.add_argument("--data", required=True, type=Path, help="dataset folder")
    parser.add_argument("--out", required=True, type=Path, help="prediction file (.jsonl)")
    args = parser.parse_args(argv)
    data: Path = args.data
    out: Path = args.out
    if not (data / "problems").is_dir() or not (data / "solutions").is_dir():
        parser.error(f"{data} has no problems/ and solutions/ folders")

    out.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with out.open("w", encoding="utf-8", newline="\n") as handle:
        for row in predictions(data, semantic_judge()):
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
            count += 1
    print(f"leetkob-check: wrote {count} predictions to {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
