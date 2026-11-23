"""leetkob-check: write one prediction line per (solution, constraint) of a dataset folder.

The dataset layout is the one in eval/dev/README.md. Only statement.md and constraints.json
are read for each problem; there is no per-problem configuration.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from checker.hard_rules import RuleResult, check
from checker.semantic import Judgement, SemanticCase, SemanticJudge, UnsureJudge


@dataclass(frozen=True)
class Constraint:
    id: str
    text: str


@dataclass(frozen=True)
class Pair:
    solution: str
    constraint: Constraint
    statement: str
    source: str


def model_off() -> bool:
    return os.environ.get("MODEL_OFF", "").strip() == "1"


def configured_models(*, no_fallback: bool) -> list[str]:
    first = os.environ.get("GEMINI_MODEL", "").strip()
    if not first:
        return []
    if no_fallback:
        return [first]
    rest = os.environ.get("GEMINI_FALLBACK_MODELS", "").split(",")
    return [first] + [m.strip() for m in rest if m.strip()]


def semantic_judge(args: argparse.Namespace) -> SemanticJudge:
    """The judge for semantic constraints. MODEL_OFF=1 never loads a network client."""
    if model_off():
        return UnsureJudge("MODEL_OFF=1: semantic constraints are not checked")
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    models = configured_models(no_fallback=args.no_fallback)
    if not api_key or not models:
        return UnsureJudge("GEMINI_API_KEY or GEMINI_MODEL is not set")
    from checker.model_judge import GeminiClient, GeminiJudge

    return GeminiJudge(
        GeminiClient(api_key),
        models,
        rpm=float(os.environ.get("GEMINI_RPM", "").strip() or 15),
        timeout_s=args.timeout,
        fallback=not args.no_fallback,
    )


def load_constraints(problem: Path) -> list[Constraint]:
    raw = json.loads((problem / "constraints.json").read_text(encoding="utf-8"))
    return [Constraint(str(item["id"]), str(item["text"])) for item in raw]


def pairs(data: Path) -> list[Pair]:
    found: list[Pair] = []
    for problem in sorted(p for p in (data / "problems").iterdir() if p.is_dir()):
        statement_file = problem / "statement.md"
        statement = statement_file.read_text(encoding="utf-8") if statement_file.exists() else ""
        constraints = load_constraints(problem)
        for solution in sorted((data / "solutions" / problem.name).glob("*.cpp")):
            source = solution.read_text(encoding="utf-8", errors="replace")
            name = f"{problem.name}/{solution.stem}"
            found += [Pair(name, c, statement, source) for c in constraints]
    return found


def decide(pair: Pair, judge: SemanticJudge) -> Judgement:
    result = check(pair.source, pair.constraint.text)
    if result is not None:
        return Judgement(result, {"called": False, "decided_by": "hard_rule"})
    case = SemanticCase(pair.statement, pair.constraint.id, pair.constraint.text, pair.source)
    try:
        return judge.judge(case)
    except Exception as error:  # a failing judge must never become a deduction
        reason = f"semantic judge failed: {type(error).__name__}"
        return Judgement(RuleResult("unsure", (), reason), {"called": False, "decided_by": "error"})


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="leetkob-check", description="Check every (solution, constraint) of a dataset."
    )
    parser.add_argument("--data", required=True, type=Path, help="dataset folder")
    parser.add_argument("--out", required=True, type=Path, help="prediction file (.jsonl)")
    parser.add_argument("--call-log", type=Path, help="write one call-log line per pair here")
    parser.add_argument("--concurrency", type=int, default=1, help="parallel pairs (default 1)")
    parser.add_argument(
        "--no-fallback",
        action="store_true",
        help="use only GEMINI_MODEL, never GEMINI_FALLBACK_MODELS",
    )
    parser.add_argument(
        "--timeout", type=float, default=30.0, help="seconds per model call (default 30)"
    )
    args = parser.parse_args(argv)
    if args.concurrency < 1:
        parser.error("--concurrency must be at least 1")
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    data: Path = args.data
    out: Path = args.out
    if not (data / "problems").is_dir() or not (data / "solutions").is_dir():
        print(f"leetkob-check: {data} has no problems/ and solutions/ folders", file=sys.stderr)
        raise SystemExit(2)

    todo = pairs(data)
    judge = semantic_judge(args)
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        decided = list(pool.map(lambda pair: decide(pair, judge), todo))

    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8", newline="\n") as handle:
        for pair, judgement in zip(todo, decided, strict=True):
            row = {
                "solution": pair.solution,
                "constraint": pair.constraint.id,
                "verdict": judgement.result.verdict,
                "evidence": [{"line": e.line, "text": e.text} for e in judgement.result.evidence],
            }
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    if args.call_log is not None:
        log: Path = args.call_log
        log.parent.mkdir(parents=True, exist_ok=True)
        with log.open("w", encoding="utf-8", newline="\n") as handle:
            for pair, judgement in zip(todo, decided, strict=True):
                entry: dict[str, object] = {
                    "solution": pair.solution,
                    "constraint": pair.constraint.id,
                }
                entry |= judgement.call
                entry["verdict"] = judgement.result.verdict
                entry["reason"] = judgement.result.reason
                handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(f"leetkob-check: wrote {len(todo)} predictions to {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
