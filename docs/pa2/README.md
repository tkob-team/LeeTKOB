# PA02 evidence directory

Start with [PA2.md](../../PA2.md) for the six required submission links. This directory groups the retained task outputs and references a single canonical copy of each screenshot or archived log.

## Task records

| Tasks | Evidence |
| --- | --- |
| T02 | [CI setup and run records](evidence/t02/README.md) |
| T03 | [Main protection](branch-protection.md), [ruleset and first-parent history](evidence/t03/README.md) |
| T04/T05/T14 | [Original environment checks](evidence/t05/README.md), [fresh-clone record](t14-fresh-clone.md), [fresh-clone output](evidence/t14/README.md) |
| T06/T07 | [Claude configuration snapshot](evidence/t06/README.md), [Codex configuration/probes](evidence/t07/README.md), [enforcement coverage](agent-permissions.md) |
| T08 | [PR template verification](evidence/t08/README.md) |
| T09/T10/T11 | [Contract snapshot](evidence/t09/README.md), [AI blind-read](evidence/t10/README.md), [red/green/mutation output](evidence/t11/README.md) |
| T12 | [Free-tier account evidence](t12-free-tier.md), [historical cost comparison](evidence/t12/README.md) |
| T13 | [Deliberate blocked PR](evidence/t13/README.md); PR10 must remain unmerged |
| T15/T16 | [Incident-derived rules](evidence/t15/README.md), [six-link evidence index](evidence/t16/README.md) |
| T17/T18/T19 | [Hiep](evidence/t17/README.md), [Hoa](evidence/t18/README.md), [Hoang](evidence/t19/README.md) AI-LOG records |
| T20 | [Immutable tag and tag CI](evidence/t20/README.md) |
| T27/T29 | [Queue decision](evidence/t27/README.md), [class-management checks](evidence/t29/README.md) |

## Layout and provenance

- Root images and account/protection records keep the existing public evidence paths.
- `logs/t05` and `logs/t14` hold the original canonical log archives and result metadata.
- `evidence/tNN` holds task indexes, unique raw outputs and historical configuration/contract snapshots. Snapshot files are not active agent configuration or current contracts.
- [Review and tracker snapshots](evidence/pa02-review/README.md) distinguish historical findings from the completed handoff.
- [Migration manifest](evidence/migration-manifest.json) records SHA-256 values and whether an old output was moved, deduplicated into an existing file/archive, or retained only in local cache. Original paths embedded in logs are provenance, not current navigation links. Generated test JWTs in three historical failure logs are replaced by REDACTED_TEST_JWT; their source/published hashes are recorded and unredacted originals remain in local cache.

Downloaded executables, nested clones/worktrees, dependency caches, scratch scripts and generated previews are outside the repository in the workspace's `.cache/pa2-cleanup` directory. They are not part of the PA02 handoff. The live plan and tracker remain at the workspace root; workbook files in the review folder are dated evidence snapshots.

The user approved committing and pushing this evidence reorganization. Application behavior and tag pa2 are unchanged; assignment submission remains separate.
