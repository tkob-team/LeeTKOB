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

## 2026-11-10 — T03: main branch ruleset (Hoang)
- Tool: Claude Code (Claude Sonnet 5.5), run in Hoang's session.
- Prompts: "start T03: set up the main ruleset"; "I have opened chrome extension, please complete T03"; "yes" to opening the evidence PR, with the reviewer's confirmation relayed by Hoang; "merge #2 and #3 please".
- Changed: created ruleset `main-protection` (ID 26913957) through the GitHub API at 10:22:50 on 2026-11-10 (UTC+07:00): target `main`, pull request required, five required checks (`lint`, `format-check`, `typecheck`, `test`, `secrets`) from GitHub Actions, empty bypass list. Added `docs/pa2/` with two screenshots and a note (PR #2, merged as 8c7d0b7).
- Kept: required approvals set to 0 so a solo PR is not blocked; the check names were read from the real runs on `main`, not guessed.
- Rejected: a single-image screenshot, because the browser window was too small to show target, bypass and checks together, so two images were taken. Did not add force-push or deletion rules, which the task does not require.
- Validation: GitHub reports both rules applying to `main`; PR #2 had 5/5 green checks before merge. The blocked-merge proof is still missing and will come from the T13 pull request.

## 2026-11-10 — T08: pull request template (Hoang)
- Tool: Claude Code (Claude Sonnet 5.5), run in Hoang's session.
- Prompts: "please update status T03 and continue with T08"; "merge #2 and #3 please".
- Changed: added `.github/pull_request_template.md` with three questions: does the PR change a contract (and which document and tests), are tests updated with the code change (with a "not needed" option), is the AI-LOG updated. PR #3, merged as 95704b1.
- Rejected: my first PR description said a reviewer had been requested, but no request had been made; I corrected the description before merge. A rule forcing test changes on every PR was not added.
- Validation: 5/5 checks green before merge. The template has not yet been seen on a newly opened PR.

## 2026-11-10 — T06: AGENTS.md, CLAUDE.md, Claude Code permissions (Hoa)
- Tool: Claude Code (Claude Sonnet 5.5), run in Hoang's session at Hoang's request; the task owner in the tracker is Hoa. No independent review is recorded.
- Prompts: "please perform task T06" (the user said not to wait for another person's review); "merge".
- Changed: added `AGENTS.md` (Stack, Commands, Conventions, Never, Permissions with allowed / ask first / never), a one-line `CLAUDE.md` importing it, and `.claude/settings.json` with allow / ask / deny rules. PR #4, merged as 20bc266.
- Rejected: did not add rules lines traced to real incidents (a separate task) or Codex configuration (T07). The deny patterns for eval data and labels (`**/dataset/**`, `**/eval-data/**`, `**/labels/**`) are placeholders because those folders do not exist yet.
- Validation: settings JSON parses; 5/5 checks green before merge. Claude Code's enforcement of the settings was not tested interactively.

## 2026-11-10 — T07: Codex permissions and trust step (Hoa)
- Tool: Claude Code (Claude Sonnet 5.5), run in Hoang's session at Hoang's request; the task owner in the tracker is Hoa. No independent review is recorded.
- Prompts: "continue with task T07. please additional my prompts into AI-LOG with name mapping task author".
- Changed: added `.codex/config.toml` (`approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`, no sandbox network) and `.codex/rules/default.rules` mapping the three levels (allow / prompt / forbidden). README now has a section telling every developer to trust the project in Codex. `AGENTS.md` now says Codex permissions exist. Added the AI-LOG entries above for T03, T06, T07, T08.
- Rejected: my first check loop reported wrong results because zsh does not split an unquoted variable into words; I re-ran it with explicit splitting before trusting any result.
- Validation: `codex execpolicy check` on 19 commands: `make` targets and read-only git returned allow; commit, push, `gh pr`, Docker, `uv add` returned prompt; force-push, push to `main`, branch/tag deletion, `rm -rf`, `cat .env` and `tail .env` returned forbidden; `ls` matched no rule. Limitation: rules only cover shell commands, so reading `.env` through other tools is not blocked, and Codex ignores this configuration until the project is trusted.

## 2026-11-10 — T09: contract for POST /labs/{labId}/submissions (Hiep)
- Tool: Claude Code (Claude Sonnet 5.5), run in Hoang's session at Hoang's request; the task owner in the tracker is Hiep. No independent review is recorded, and the owner has not confirmed the decisions below.
- Prompts: "please continue with T09".
- Inputs: the FAQ (FAQ-01, 02, 03, 05), the team decisions sheet (endpoint, `Idempotency-Key` stored in the database with a unique constraint, Bearer JWT HS256, RFC 9457 errors), and the rubric rows for the contract.
- Changed: added `docs/contract/post-labs-submissions.md`: who may call it, request rules, order of checks, 201/200 responses, an RFC 9457 type-to-status table, idempotency rules, change policy, and the contract tests the file requires.
- Decisions made while drafting (to confirm): a student outside the lab's class gets the same 404 as an unknown lab; `TA`/`ADMIN` get 403; the same key with a different body is 422; a replay returns 200 with `Idempotency-Replayed: true` and skips the deadline check; deadline is exclusive (`now < due_at`); unknown body fields are rejected; keys are 16-64 characters and never expire in PA#02.
- Rejected: answering 403 for a student outside the class (it would reveal that the lab exists); a `Location` header (no read endpoint exists yet); an "in progress" error for concurrent requests (the unique constraint makes one request win and the other replay).
- Rejected: the first draft's example `Idempotency-Key` was a realistic UUID, which Gitleaks flagged as a generic API key and failed the `secrets` check on the PR. Fixed by using a placeholder in the example, not by allowlisting; the flagged commit was replaced by force-pushing the feature branch only, with the user's approval.
- Validation: documentation only; no code or tests were changed, so no check output is claimed beyond CI. The contract tests listed in section 8 are not written yet (T11).

## 2026-11-10 — T10: blind read of the contract (Hoa)
- Tool: Claude Code (Claude Sonnet 5.5), run in Hoang's session at Hoang's request; the task owner in the tracker is Hoa. The reader was a separate AI subagent (Claude, `sonnet`), not a person. No independent review is recorded.
- Prompts: "merge and continue with T10"; the answer "Fresh subagent" to the question of who should do the blind read.
- Changed: the subagent received only the text of `docs/contract/post-labs-submissions.md` 0.1.0 (no repository, no tools, no chat) and wrote the first request, a retry and seven failing requests, then listed 22 places where it had to guess. Added section 9 and version 0.2.0 to the contract to cover them. Its report is kept outside the repository with the other task evidence.
- Kept: the 0.1.0 rules are unchanged; version 0.2.0 only fills gaps (non-breaking).
- Rejected: reading the contract myself, because I wrote it in the same session and could not be blind. Did not address gaps 19 (retention of stored code) and 20 (duplicate JSON keys, nesting depth); changing the order of checks to answer gap 5 was also rejected as a breaking change.
- Validation: all seven failing requests the reader wrote matched the contract's intended status and `type`. New rules (body cap, 405, case sensitivity, waiting on concurrent keys) are drafting decisions the contract owner has not confirmed. Gitleaks found no secrets in the working tree. No code or tests changed.

## 2026-11-10 — T11: contract tests and POST /labs/{labId}/submissions (Hiep)
- Tool: Claude Code (Claude Sonnet 5.5), run in Hoang's session at Hoang's request; the task owner in the tracker is Hiep. The contract's drafting decisions were confirmed by the team through Hoang. No independent code review is recorded.
- Prompts: "Hiep has confirmed. Please each request, I have ask my team and my partner has confirmed, so continue with task T11"; "yes" to merging PR #7 (contract 0.2.0) first.
- Changed: red commit `ec8ad3c` adds 32 contract tests (`SubmissionContractTest`, real HTTP layer and PostgreSQL through Testcontainers, a movable test clock) and a fake JWT key in `TestcontainersConfiguration`. Green commit `8338877` adds the Flyway migration (`users`, `classes`, `class_members`, `labs`, `submissions` with a unique `(student_id, idempotency_key)`), HS256 Bearer authentication, RFC 9457 responses, and the endpoint. No test file changed between the two commits.
- Decisions made while implementing: a `users` table exists so a token whose `sub` has no user is 401; the endpoint reads the raw body instead of using `consumes`, so a TA with a wrong content type still gets 403 (role before content type); the idempotent insert uses `ON CONFLICT DO NOTHING`, so a concurrent request waits and then replays; `Clock` is a bean so tests can move time.
- Rejected: letting Spring's `consumes` and `@RequestBody` handle media type and JSON (they would answer in a different order and format than the contract); allowlisting anything in Gitleaks (the fake test key passes without it); trusting the first green result without a mutation check.
- Validation: the red CI run (`test` job only, 32 errors: relation "submissions" does not exist) and the green CI run (33 tests, 5/5 checks) are linked in `outputs/t11/`. Locally all four `make` targets exit 0. Mutation check: breaking the deadline comparison and the role check made 5 tests fail. Not covered: the `internal-error` path is exercised only by a clock failure injected by the test; duplicate JSON keys and nesting depth (contract gap 20) are untested.
