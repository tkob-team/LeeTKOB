# AI-LOG

## 2026-11-04 — Scaffold repo: Spring Boot backend, Python checker, make checks (A)
- Tool: Claude Code (Claude Opus 5.5)
- Asked for: scaffold backend/ and checker/ with one make target each for lint, format-check, typecheck, test; no business code.
- Kept: project layout, Makefile run_both (runs both halves, fails if either fails), Checkstyle violationSeverity=warning, Spotless forced to LF.
- Changed: Java 21 -> 25 to match the dev machines and the README; checks are run in WSL only.
- Rejected: the first report said "all four checks pass", but it had run the commands by hand in Git Bash, not through make; running make in WSL failed (uv not installed, JDK 17). Also rejected an unrelated offer to set up a status-line badge.
- By hand: installed JDK 25 and uv in WSL, ran the four make targets (exit 0), read the four deliberate-failure runs (exit 2 each).