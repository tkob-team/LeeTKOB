# AI-LOG

## 2026-11-04 — Scaffold repo: Spring Boot backend, Python checker, make checks (A)
- Attribution: the tracker Overview sheet maps A to Hiep; the original author label is retained.
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

## 2026-11-10 — T12: model and cost section in the README (Hiep)
- Tool: Claude Code (Claude Sonnet 5.5), run in Hoang's session at Hoang's request; the task owner in the tracker is Hiep. No independent review is recorded.
- Prompts: "merge and continue with T12"; answers to three questions: the provider is Gemini, the spending limit is for me to propose because the owner will consider it, and the lab size is 80 students and 5 constraints.
- Changed: added the "Model and cost" section to `README.md` (provider, initial model, key handling, proposed spending limit, planned per-lab call cap, cost of one lab with its assumptions and a link to the pricing page) and an empty `GEMINI_MODEL` line to `.env.example`.
- Not done: no API key was created and no spending limit was set. Those are account actions held by the key owner, so the README marks the limit as a proposed value that is not yet confirmed as set. The rubric item "the key has a spending limit" stays unmet until the owner sets it and updates that line.
- Rejected: stating the limit as already set; inventing a measured token count (the 2,000 input and 1,500 output tokens per call are labelled assumptions); naming a model from memory (the model and its prices come from the Gemini pricing page, read on 2026-11-10, which shows no update date).
- Validation: the cost table was recomputed with a script (400 calls; USD 2.85 and 5.70 per pass, doubled with retries). Gitleaks found no secrets. Docs only; no code or tests changed.

## 2026-11-10 — T13: deliberate contract break, not merged (Hoang)
- Tool: Claude Code (Claude Sonnet 5.5), run in Hoang's session.
- Prompts: "please merge T11 and continue with T13". T11 (PR #8) was already merged, so only T13 was done; PR #9 (T12) was deliberately left unmerged.
- Changed: [PR #10](https://github.com/tkob-team/LeeTKOB/pull/10), branch `test/t13-break-contract-ownership`, commit `d12c32c`. One implementation file, `SubmissionRepository.findLabForMember`: the class-membership condition was removed, so any student can submit to any lab. This breaks the ownership rule in section 1 of the contract. No contract, test, data or workflow file was touched (checked with the file list of the PR).
- Result: CI run 42779970787: `lint`, `format-check`, `typecheck`, `secrets` passed and `test` failed on exactly `otherClassStudentGetsLabNotFound` and `removedMemberReplayGetsNotFound` (404 expected, 200 returned), the same two tests I saw fail locally before pushing. The merge state of the PR is `BLOCKED`. The PR was not merged and `main` stayed green (run 42777572781).
- Rejected: proving the block by trying to merge (if the ruleset had been wrong, broken code would have reached `main`); breaking a rule by editing a test or the contract; a draft PR, because a draft would hide whether the checks or the draft state blocks the merge. The "internal-error" test prints a stack trace in the CI log for its injected clock failure; that is expected output, not a failure.
- Validation: failing tests were confirmed locally and in CI; the red run is evidence for T13 and the blocked state is the missing proof for T03. It does not replace the T11 red-then-green evidence. The PR is left open for the evidence links; closing it is optional.

## 2026-11-10 — T19: summary of my PA#02 work (Hoang)
- Tools: Codex for T05 and T02 (see their entries above); Claude Code (Claude Sonnet 5.5) for T03, T08 and T13, and for the other PA#02 tasks listed below that I ran in my own session for their owners. The model made the changes; I gave the prompts, approved each outward step (merges, one force-push of a feature branch, the pull requests) and relayed the team's confirmations.
- My tasks and the evidence (all merged unless stated):
  - T05 environment and four `make` checks: all four exited 0 on commit b76ccd5 (macOS arm64, not WSL); logs in my local `outputs/t05/`.
  - T02 CI with five jobs: PR #1, merge commit 2a8728b, CI 5/5 green before and after the merge.
  - T03 `main-protection` ruleset: enabled 2026-11-10 10:22:50 (UTC+07:00), two screenshots in `docs/pa2/` through PR #2 (8c7d0b7), the reviewer's confirmation relayed by me.
  - T08 pull request template: PR #3 (95704b1), merged before its reviewer had looked at it.
  - T13 deliberate contract break: PR #10, not merged, red CI run 42779970787, merge state `BLOCKED`; entry above.
- Work done in my session for other owners, each with its own entry above: T06 and T07 (owner Hoa, PR #4 and #5), T09 and T11 and T12 (owner Hiep, PR #6, #8 and #9), T10 (owner Hoa, PR #7, reader was an AI subagent). None of these had an independent human review before merging; the contract decisions were confirmed by the team through me.
- Changed: the CI workflow, ruleset, PR template, the `docs/pa2/` evidence, and for the tasks above the rules files, Codex configuration, contract 0.2.0, the endpoint with 32 contract tests, and the README model and cost section. Every change reached `main` by pull request with five green checks; no direct push to `main`.
- Rejected, concretely:
  - T02: an LLM evaluation as a required check (the team moved it to a later milestone).
  - T03: one single screenshot (the window was too small, so two were taken); force-push and deletion rules (not required).
  - T08: my first PR description said a reviewer had been requested when none had; I corrected it. I also rejected a rule forcing test changes on every PR.
  - T09: allowlisting an example `Idempotency-Key` that Gitleaks flagged; I used a placeholder and replaced the flagged commit with one approved force-push of that feature branch only.
  - T13: trying to merge the broken PR to prove the block, and any change to the contract or tests.
  - T07: my first test loop gave wrong results because zsh does not split unquoted variables; it was re-run before any result was used.
  - T12: creating the API key or setting the spending limit myself, and stating the limit as already set.
  - Chrome automation was not available in two sessions, so no browser action was taken for the API key; the T03 screenshots were taken earlier with it.
- Not done or not verified: T13 is waiting for Hiep to check the evidence; the T12 spending limit (USD 20 per month) is a proposal that the key owner has not confirmed as set, and no key exists in this repository; the pull request template has not been seen on a PR opened in the web interface (mine were opened with `gh`, which bypasses it); Claude Code and Codex permission files were checked by syntax and `codex execpolicy`, not in an interactive session.
- Validation: CI on `main` was green after each merge (latest run 42782617480 on f6acb8f). Gitleaks reports no secrets in the history. The evidence index for the submission is in `outputs/` next to this repository (one folder per task).

## 2026-11-10 — Reviewed follow-ups across the team (Hoang; owners retained)
- Tool: Codex. Asked to review all T01–T41, then complete supplements for the tasks already worked on. Hoang stated that the items had been reviewed and requested the corrections; this is a reported team review, not a claim that GitHub Review events exist.
- Changed: captured request receipt time in the first application filter and used its full precision for opening/deadline checks; only the stored response timestamp is truncated to milliseconds. Made `exp` required and configured zero JWT expiration grace, updating the contract to 1.0.0 with a breaking-change record. Corrected the data description to direct code comparison.
- Changed: added five behavioral regression tests without weakening existing assertions; clarified permission coverage, added common Git option/refspec rules and a 19-case safe command checker; added two incident-traced AGENTS rules from the T01/T07 records; published the T27 queue decision and prepared `PA2.md`.
- Changed: verified the real GitHub new-PR form automatically populated all three questions, and captured PR #10's required failing test plus disabled merge button. Published these screenshots and original T05 logs under `docs/pa2/`. Updated local task/evidence records and the team tracker separately from the product repository.
- Kept: original task owners (Hiep, Hoa, Hoang), the actual AI authorship/session provenance, existing required checks/ruleset, all previous contract-test assertions, and T13 as an unmerged code-only failure. The original scaffold entry's author label "A" remains historical; the tracker assigns T01 to Hiep.
- Rejected: claiming a key or cap had been set (Hoang confirmed neither exists); pretending the follow-up macOS checks were Hoa's fresh-clone/environment run; claiming a human blind reader or interactive permission test; describing shell-prefix checks as a universal secret-file firewall. The first remote test commit required a formatting fix; a separate style commit preserved history rather than force-pushing.
- Validation: five added tests first failed locally with 5 assertion failures and 0 setup errors; the fixed suite passed all 37 contract tests. Exact `make lint`, `make format-check`, `make typecheck`, `make test` each exited 0 on macOS/JDK 25. All 19 executable-rule decisions matched their expected levels; no command being checked was executed.
- Evidence: [PR #13](https://github.com/tkob-team/LeeTKOB/pull/13), [formatted test baseline 4ddd760](https://github.com/tkob-team/LeeTKOB/commit/4ddd760), [red CI baseline](https://github.com/tkob-team/LeeTKOB/actions/runs/42809598818), [follow-up record](docs/pa2/reviewed-follow-ups.md), [T05 logs](docs/pa2/logs/t05/results.json), [T13 blocked screenshot](docs/pa2/t13-blocked.png), [template screenshot](docs/pa2/pr-template-autofill.png), [green main before this follow-up](https://github.com/tkob-team/LeeTKOB/actions/runs/42782617480). Final PR CI must pass before merge; no release tag or submission is claimed.

## 2026-11-10 — T12: provision Gemini key, user-selected Free tier
- Tool: Codex with Chrome UI automation. Task owner remains Hiep; account setup was performed in Hoang's signed-in Google AI Studio at his explicit request and action-time confirmation: create it and keep Free tier.
- Changed: created project LeeTKOB (`gen-lang-client-0403299997`) and key display name `leetkob-pa02`. Verified the key list says Free tier and the project's Spend page says no billing is configured. Updated README, PA2 evidence and task tracking to replace the earlier USD 20/month proposal with the user's Free-tier-only choice.
- Kept: no paid billing account, payment method or dollar spending cap was added; other projects were untouched. The key value was not revealed in chat/logs, committed, copied to `.env`, or used for a real API call. The key holder can retrieve it in AI Studio.
- Rejected: treating an unconfigured USD 20 cap as real; describing Free tier as a configured dollar cap; copying an unrelated project's existing key. An initial browser action was blocked pending confirmation; creation proceeded only after Hoang explicitly confirmed.
- Validation: observed the new project/key and Free tier in the live UI, then the project-specific no-billing message. Screenshots contain only the masked key label. This proves account provisioning, not model-call validity or the capacity of a free quota for a full lab.
- Evidence: [T12 account record](docs/pa2/t12-free-tier.md), [masked key list](docs/pa2/t12-free-tier-api-key.png), [no billing](docs/pa2/t12-free-tier-no-billing.png). T12 is complete under the user-selected Free-tier-only policy; this documentation supplement awaits the existing PR #13 merge.

## 2026-11-10 — T29: class management and class-scoped permissions

- Tool: Codex. Prompt: complete T14/T15/T16/T29 on the shared team workstation, regardless of which developer owns the task.
- Kept: the existing HS256 verifier, submission contract/tests and PostgreSQL schema history. All access uses the signed subject; account/password login remains T28.
- Changed: added a versioned class API contract, additive migration V2, persisted global roles, administrator creation/TA assignment, secure student invitations, scoped class lists/details/staff rosters and duplicate-safe memberships. Unsupported-method responses now advertise the actual mapped methods while retaining Allow: POST on submissions.
- Tests: twelve HTTP/PostgreSQL integration cases cover role and cross-class boundaries, unknown/invalid inputs, role changes, concurrent joins, spoofed body fields, and submission access after joining. Original tests/assertions are unchanged.
- Rejected: allowing request bodies to choose the authenticated user or grant a TA role; assigning students as TAs; treating this class API as completion of T28 login. An initial new test reused a request builder and accumulated Authorization headers; its fixture now replaces the header per call, preserving the original access-denial assertion.
- Validation: all four exact make commands exit 0 on the shared macOS workstation; backend reports 50 tests (12 new class tests plus 38 existing tests), 0 failures/errors/skips; checker reports 1 test passed. Original submission-contract test file is unchanged.
## 2026-11-10 — T14: fresh clone on the shared team workstation

- Tool: Codex. Prompt: Hoang clarified that Hoa and Hiep work on this same machine; complete their tasks here and mark completed work done.
- Kept: original task ownership and actual native macOS arm64 provenance.
- Changed: fetched a new clone from GitHub at `cebb551`, selected the README prerequisites, and ran all four exact make commands without real credentials. All exit codes are 0; see [results](docs/pa2/logs/t14/results.json), [full output](docs/pa2/logs/t14/make-logs.zip) and [setup record](docs/pa2/t14-fresh-clone.md). This completes the shared-workstation T04/T14 verification; a separate personal machine is not required by the team.
- Rejected: inventing a WSL run or maintaining the earlier assumption that different owners require different computers.
