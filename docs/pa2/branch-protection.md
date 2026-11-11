# Branch protection for `main`

The `main-protection` ruleset (ID 26913957) was enabled on 2026-11-10 at 10:22:50 (UTC+07:00, Vietnam time).

- Target: `refs/heads/main` only.
- Rules: changes must go through a pull request; the checks `lint`, `format-check`, `typecheck`, `test` and `secrets` (GitHub Actions) must pass.
- Bypass list: empty.

Evidence:

- [branch-protection.png](branch-protection.png): enforcement status, empty bypass list, target branch.
- [branch-protection-2-required-checks.png](branch-protection-2-required-checks.png): pull request rule and the five required checks.
- [branch-protection.png](branch-protection.png): canonical filename, an unchanged copy of the target/bypass screenshot; the second image above is still needed to see all five checks.
- [T13 PR #10](https://github.com/tkob-team/LeeTKOB/pull/10), [red CI](https://github.com/tkob-team/LeeTKOB/actions/runs/42779970787), [disabled merge screenshot](t13-blocked.png): the implementation-only ownership regression is blocked by the required test. It remains unmerged.
- Review completion was confirmed by Hoang on 2026-11-10. The confirmation is recorded as reported, not as a GitHub Review event.
