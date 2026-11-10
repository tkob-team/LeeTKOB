# AI-LOG

## 2026-11-04 — Scaffold repo: Spring Boot backend, Python checker, make checks (A)
- Tool: Claude Code (Claude Opus 5.5)
- Asked for: scaffold backend/ and checker/ with one make target each for lint, format-check, typecheck, test; no business code.
- Kept: project layout, Makefile run_both (runs both halves, fails if either fails), Checkstyle violationSeverity=warning, Spotless forced to LF.
- Changed: Java 21 -> 25 to match the dev machines and the README; checks are run in WSL only.
- Rejected: the first report said "all four checks pass", but it had run the commands by hand in Git Bash, not through make; running make in WSL failed (uv not installed, JDK 17). Also rejected an unrelated offer to set up a status-line badge.
- By hand: installed JDK 25 and uv in WSL, ran the four make targets (exit 0), read the four deliberate-failure runs (exit 2 each).

## 2026-11-09 — T05: local environment and four make checks (Hoang)
- Tool: Codex.
- Asked for: complete T05 by preparing the local environment and running all four make targets; review tasks are out of scope.
- Environment: native macOS arm64, JDK 25.0.5.0.3, uv 0.13.7, Python 3.12.16, Docker Desktop 4.98.0 / Engine 29.9.2, GNU Make 3.81. This was not a WSL run.
- Changed: installed uv with Homebrew, started Docker Desktop, selected the existing JDK 25 for the check process instead of the default JDK 26. uv created the checker virtual environment from the committed lockfile. No application code, tests, build configuration, or lockfiles were changed.
- Rejected: no AI-generated application code changes were proposed or applied for this environment task.
- Validation: on source commit b76ccd5d4c863e7df41a27810d0a016b5dbad0a7, `make lint`, `make format-check`, `make typecheck`, and `make test` each exited 0. Backend tests used PostgreSQL 17 Alpine through Testcontainers; checker pytest passed.
- Evidence: local sibling directory `../outputs/t05/` contains `environment.log`, `results.json`, and `make-{lint,format-check,typecheck,test}.log`. These local logs have not been published as PR/CI evidence.
- Reproduction: keep Docker Desktop running, set `JAVA_HOME` to the installed JDK 25 and prepend its `bin` directory to PATH, then run the four commands from the repository root.

## 2026-11-10 — T02: five CI quality checks (Hoang)
- Tool: Codex.
- Asked for: implement T02 with five CI jobs, the same four Makefile commands as local development, pull-request runs, and `pa*` tag runs.
- Changed: added `.github/workflows/ci.yml` and a shared toolchain setup action. The jobs are `lint`, `format-check`, `typecheck`, `test`, and `secrets`. Added main push/manual triggers, read-only token permissions, job timeouts, and cancellation of superseded runs. Documented the workflow and corrected the README's Java 21 label to match JDK 25.
- Changed: pinned external actions to verified commit SHAs; pinned uv and Gitleaks versions. The secrets job fetches full history, verifies the Gitleaks release checksum, and scans all refs with redacted output.
- Rejected: did not add LLM evaluation as a required PA#02 check, consistent with the team's recorded milestone decision. Did not change application code, tests, or the Makefile.
- Validation: local checks passed during T05 on the unchanged application source. actionlint 1.7.12 passed; Gitleaks 8.30.1 found no secrets in the full Git history or working directory. Both validation binaries were verified against their release checksums. GitHub Actions run evidence will be recorded after execution; this entry does not claim a passing remote run yet.
