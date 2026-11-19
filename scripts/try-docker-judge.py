#!/usr/bin/env python3
"""T22 smoke check for one fixed, trusted C++17 submission."""

import argparse
import json
import statistics
import subprocess
import sys
import time
import uuid

SOURCE = """#include <iostream>
int main() {
    int n = 0;
    if (!(std::cin >> n)) return 1;
    std::cout << n * 2 << '\\n';
}
"""
IMAGE = "gcc:14.3.0"


def grade_sample(image: str) -> float:
    name = f"leetkob-sandbox-smoke-{uuid.uuid4().hex}"
    start = time.perf_counter()
    try:
        result = subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "--pull=never",
                "--name",
                name,
                "-i",
                "--network=none",
                "--read-only",
                "--cap-drop=ALL",
                "--security-opt=no-new-privileges=true",
                "--user=65534:65534",
                "--memory=256m",
                "--memory-swap=256m",
                "--cpus=1",
                "--pids-limit=32",
                "--tmpfs=/work:rw,exec,nosuid,nodev,size=64m,mode=1777",
                "--workdir=/work",
                "--env=TMPDIR=/work",
                image,
                "sh",
                "-ceu",
                "cat > Main.cpp; timeout -k 1s 10s g++ -std=c++17 -O2 Main.cpp -o Main; "
                'printf "21\\n" | timeout -k 1s 2s ./Main',
            ],
            input=SOURCE,
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=False,
            timeout=20,
        )
    except subprocess.TimeoutExpired:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True, check=False, timeout=5)
        raise
    elapsed = time.perf_counter() - start
    if result.returncode != 0:
        raise RuntimeError(f"Docker exited {result.returncode}: {result.stderr.strip()}")
    if result.stdout != "42\n":
        raise RuntimeError(f"Expected '42\\n', got {result.stdout!r}")
    return round(elapsed * 1_000, 1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", default=IMAGE, help="Pre-pulled official GCC image or digest")
    parser.add_argument("--runs", default=5, type=int, help="Number of sequential sample runs")
    args = parser.parse_args()
    if not 1 <= args.runs <= 20:
        parser.error("--runs must be between 1 and 20")

    try:
        samples = [grade_sample(args.image) for _ in range(args.runs)]
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"Sandbox smoke check failed: {error}", file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "image": args.image,
                "expectedOutput": "42",
                "verdict": "AC",
                "runs": args.runs,
                "elapsedMs": samples,
                "medianMs": statistics.median(samples),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
