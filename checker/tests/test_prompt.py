"""The prompt is general: it never names a dev-set problem or solution, and it prefers unsure."""

import re
from pathlib import Path

from checker.model_judge import PROMPT_TEMPLATE, build_prompt

DEV = Path(__file__).resolve().parents[2] / "eval" / "dev"


def dev_ids() -> tuple[set[str], set[str]]:
    problems = {p.name for p in (DEV / "problems").iterdir() if p.is_dir()}
    solutions = {f"{s.parent.name}/{s.stem}" for s in (DEV / "solutions").glob("*/*.cpp")} | {
        s.stem for s in (DEV / "solutions").glob("*/*.cpp")
    }
    return problems, solutions


def test_prompt_template_names_no_dev_problem_or_solution() -> None:
    problems, solutions = dev_ids()
    text = PROMPT_TEMPLATE.lower()
    assert problems and solutions
    for problem in problems:
        assert problem not in text
        assert problem.replace("-", " ") not in text
    words = set(re.findall(r"[a-z0-9/_-]+", text))
    assert not (words & {s.lower() for s in solutions})


def test_built_prompt_adds_only_the_given_statement_constraint_and_code() -> None:
    prompt = build_prompt("Statement.", "Constraint.", "int main() {}")
    problems, solutions = dev_ids()
    words = set(re.findall(r"[a-z0-9/_-]+", prompt.lower()))
    assert not (words & ({p.lower() for p in problems} | {s.lower() for s in solutions}))


def test_prompt_judges_only_this_constraint_and_prefers_unsure() -> None:
    text = " ".join(PROMPT_TEMPLATE.split())
    assert "Judge only this constraint" in text
    assert "If you are not sure, answer unsure" in text
