# Agent permission coverage

The team's review was confirmed by Hoang on 2026-11-10. This follow-up addresses
the distinction between policy and runtime enforcement identified in T06/T07.

| Level | Policy | Configuration coverage |
| --- | --- | --- |
| Allowed | Read ordinary repo files; edit source/docs; run quality gates | Workspace writes and documented make commands; Claude allow rules and Codex shell rules |
| Ask first | Dependency/build/CI/migration edits, commits, feature pushes, PR operations, network and Docker | Claude edit/command rules; Codex workspace/network sandbox and matching shell prompt rules. Codex per-file edit approval remains an instruction |
| Never | Read real secrets, alter eval labels, force-push, push main, delete branches/tags, destructive deletion | Claude configured read/edit/command deny rules and matching Codex forbidden prefixes. No universal protection against every interpreter, tool or Git argument arrangement is claimed |

Codex loads project rules only after the developer trusts the project. A prompt
for listed global Git options catches forms such as `git -C . push ...`;
common force/deletion/refspec forms are explicitly forbidden. Other arrangements
may not match a rule and remain subject to the runtime's default sandbox and
approval policy; absence of a match is not proof that a command is safe.

Reproduce the executable-rule checks, without executing any command under test:

```sh
python3 scripts/check-agent-permissions.py
```

The script uses argument arrays and `codex execpolicy check`. It also parses the
Claude settings and checks the one-line CLAUDE import. It does not read `.env`,
perform a push/deletion or invoke a model. Results prove those checks only.

For interactive verification on each developer's machine, use disposable files
and a disposable repository: confirm the active trusted project, one allowed
operation, one approval prompt, and one denied operation. Do not test with real
credentials. No unattended Codex/Claude session is launched by the validation
script, and interactive enforcement is not claimed by its result.

References: [OpenAI Rules](https://learn.chatgpt.com/docs/agent-configuration/rules),
[Claude Code permissions](https://code.claude.com/docs/en/permissions).
