"""Check configuration and shell decisions without executing the example commands."""

import json
from pathlib import Path
import subprocess


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    settings = json.loads((root / ".claude/settings.json").read_text())
    assert set(settings["permissions"]) == {"allow", "ask", "deny"}
    assert (root / "CLAUDE.md").read_text().strip() == "@AGENTS.md"
    cases = [
        (["make", "lint"], "allow"),
        (["make", "format-check"], "allow"),
        (["make", "typecheck"], "allow"),
        (["make", "test"], "allow"),
        (["git", "status"], "allow"),
        (["git", "commit", "-m", "example"], "prompt"),
        (["git", "push", "origin", "feature"], "prompt"),
        (["git", "-C", ".", "push", "origin", "main"], "prompt"),
        (["git", "push", "origin", "--force", "feature"], "forbidden"),
        (["git", "push", "--force-with-lease", "origin", "feature"], "forbidden"),
        (["git", "push", "origin", "--force-with-lease", "feature"], "forbidden"),
        (["git", "push", "origin", "main"], "forbidden"),
        (["git", "push", "origin", "HEAD:main"], "forbidden"),
        (["git", "push", "origin", "HEAD:refs/heads/main"], "forbidden"),
        (["git", "push", "origin", "--delete", "feature"], "forbidden"),
        (["git", "branch", "-d", "feature"], "forbidden"),
        (["git", "tag", "--delete", "example"], "forbidden"),
        (["cat", ".env"], "forbidden"),
        (["uv", "add", "example-package"], "prompt"),
    ]
    for command, expected in cases:
        result = subprocess.run(
            ["codex", "execpolicy", "check", "--rules", str(root / ".codex/rules/default.rules"), "--", *command],
            check=True,
            capture_output=True,
            text=True,
        )
        actual = json.loads(result.stdout).get("decision")
        assert actual == expected, (command, expected, actual)
        print(f"{actual}: {json.dumps(command)}")
    print(f"PASS: {len(cases)} shell decision checks; Claude JSON and import valid")


if __name__ == "__main__":
    main()
