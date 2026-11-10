# Branch protection for `main`

The `main-protection` ruleset (ID 26913957) was enabled on 2026-11-10 at 10:22:50 (UTC+07:00, Vietnam time).

- Target: `refs/heads/main` only.
- Rules: changes must go through a pull request; the checks `lint`, `format-check`, `typecheck`, `test` and `secrets` (GitHub Actions) must pass.
- Bypass list: empty.

Evidence:

- [branch-protection-1-target-bypass.png](branch-protection-1-target-bypass.png): enforcement status, empty bypass list, target branch.
- [branch-protection-2-required-checks.png](branch-protection-2-required-checks.png): pull request rule and the five required checks.
