"""The checker command: one prediction line per pair, valid for eval.mjs, offline with MODEL_OFF."""

import json
import shutil
import socket
import subprocess
import sys
from pathlib import Path

import pytest

from checker.cli import main

EVAL = Path(__file__).resolve().parents[2] / "eval"


def expected_pairs(data: Path) -> list[tuple[str, str]]:
    pairs = []
    for problem in sorted((data / "problems").iterdir()):
        ids = [c["id"] for c in json.loads((problem / "constraints.json").read_text("utf-8"))]
        for solution in sorted((data / "solutions" / problem.name).glob("*.cpp")):
            pairs += [(f"{problem.name}/{solution.stem}", cid) for cid in ids]
    return pairs


def read_predictions(path: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in path.read_text("utf-8").splitlines()]


@pytest.fixture
def no_network(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    attempts: list[str] = []

    class BlockedSocket(socket.socket):
        def __init__(self, *args: object, **kwargs: object) -> None:
            attempts.append("socket")
            raise OSError("network is blocked in this test")

    def blocked(*args: object, **kwargs: object) -> object:
        attempts.append("connect")
        raise OSError("network is blocked in this test")

    monkeypatch.setattr(socket, "socket", BlockedSocket)
    monkeypatch.setattr(socket, "create_connection", blocked)
    monkeypatch.setattr(socket, "getaddrinfo", blocked)
    return attempts


@pytest.mark.parametrize("dataset", ["dev", "own"])
def test_writes_exactly_one_line_per_pair(dataset: str, tmp_path: Path) -> None:
    out = tmp_path / "predictions.jsonl"
    assert main(["--data", str(EVAL / dataset), "--out", str(out)]) == 0

    rows = read_predictions(out)
    assert [(r["solution"], r["constraint"]) for r in rows] == expected_pairs(EVAL / dataset)
    for row in rows:
        assert set(row) == {"solution", "constraint", "verdict", "evidence"}
        assert row["verdict"] in ("pass", "violation", "unsure")
        evidence = row["evidence"]
        assert isinstance(evidence, list)
        assert all(set(e) == {"line", "text"} and e["line"] >= 1 for e in evidence)


def test_semantic_constraints_are_unsure_until_a_model_is_installed(tmp_path: Path) -> None:
    out = tmp_path / "predictions.jsonl"
    data = tmp_path / "data"
    shutil.copytree(EVAL / "own", data)
    constraints = data / "problems" / "count-distinct" / "constraints.json"
    constraints.write_text(
        json.dumps([{"id": "C9", "text": "Count with a nested scan you wrote.", "deduction": 1}]),
        encoding="utf-8",
    )
    main(["--data", str(data), "--out", str(out)])
    rows = [r for r in read_predictions(out) if r["constraint"] == "C9"]
    assert len(rows) == 5
    assert all(r["verdict"] == "unsure" and r["evidence"] == [] for r in rows)


def test_prediction_file_is_accepted_by_eval_mjs(tmp_path: Path) -> None:
    node = shutil.which("node")
    assert node is not None, "Node.js 22 is required to run eval/dev/eval.mjs"
    for dataset in ("dev", "own"):
        out = tmp_path / f"{dataset}.jsonl"
        main(["--data", str(EVAL / dataset), "--out", str(out)])
        result = subprocess.run(
            [node, str(EVAL / "dev" / "eval.mjs"), "--data", str(EVAL / dataset)]
            + ["--predictions", str(out)],
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode in (0, 1), result.stdout + result.stderr
        assert "wrongful deductions    0 " in result.stdout


def test_model_off_runs_dev_without_opening_the_network(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, no_network: list[str]
) -> None:
    monkeypatch.setenv("MODEL_OFF", "1")
    before = set(sys.modules)
    out = tmp_path / "predictions.jsonl"

    assert main(["--data", str(EVAL / "dev"), "--out", str(out)]) == 0

    assert no_network == []
    loaded = set(sys.modules) - before
    assert not {m for m in loaded if m.startswith(("checker.model", "google", "httpx"))}
    assert len(read_predictions(out)) == len(expected_pairs(EVAL / "dev"))


def test_missing_dataset_folder_is_an_error(tmp_path: Path) -> None:
    with pytest.raises(SystemExit) as exit_info:
        main(["--data", str(tmp_path / "nope"), "--out", str(tmp_path / "out.jsonl")])
    assert exit_info.value.code == 2
