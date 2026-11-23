"""Run the hard rules over every ban-list pair of the eval datasets in eval/."""

import json
from dataclasses import dataclass
from pathlib import Path

import pytest

from checker.hard_rules import banned_names, check

EVAL = Path(__file__).resolve().parents[2] / "eval"


@dataclass(frozen=True)
class Score:
    pairs: int
    violations: int
    caught: int
    wrongful: list[str]
    unsure: list[str]
    missed: list[str]


def score(data: Path) -> Score:
    constraints = {
        (problem.name, c["id"]): c["text"]
        for problem in sorted((data / "problems").iterdir())
        for c in json.loads((problem / "constraints.json").read_text(encoding="utf-8"))
    }
    pairs = violations = caught = 0
    wrongful: list[str] = []
    unsure: list[str] = []
    missed: list[str] = []
    for raw in (data / "labels.jsonl").read_text(encoding="utf-8").splitlines():
        label = json.loads(raw)
        solution, cid = label["solution"], label["constraint"]
        text = constraints[(solution.split("/")[0], cid)]
        if banned_names(text) is None:
            continue
        pairs += 1
        key = f"{solution} {cid}"
        source = (data / "solutions" / f"{solution}.cpp").read_text(encoding="utf-8")
        result = check(source, text)
        assert result is not None
        if result.verdict == "unsure":
            unsure.append(key)
        if label["label"] == "pass":
            if result.verdict == "violation":
                wrongful.append(key)
            continue
        violations += 1
        lines = source.split("\n")
        hit = result.verdict == "violation" and any(
            e.line in label["evidence"] and e.text.strip() == lines[e.line - 1].strip()
            for e in result.evidence
        )
        if hit:
            caught += 1
        else:
            missed.append(key)
    return Score(pairs, violations, caught, wrongful, unsure, missed)


@pytest.mark.parametrize("dataset", ["dev", "own"])
def test_ban_list_pairs_have_no_wrongful_deduction_and_no_unsure(
    dataset: str, capsys: pytest.CaptureFixture[str]
) -> None:
    result = score(EVAL / dataset)
    recall = result.caught / result.violations
    with capsys.disabled():
        print(
            f"\n[hard rules] eval/{dataset}: {result.pairs} ban-list pairs, "
            f"recall {result.caught}/{result.violations} = {recall:.1%}, "
            f"wrongful {len(result.wrongful)}, unsure {len(result.unsure)}, "
            f"missed {result.missed}"
        )
    assert result.pairs > 0
    assert result.wrongful == []
    assert result.unsure == []
    assert recall >= 0.9
