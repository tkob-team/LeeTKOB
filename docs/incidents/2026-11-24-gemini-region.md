# Gemini region incident post-mortem

## Impact

The PA3 walkthrough on Azure East Asia could submit and grade C++ code. Semantic checks
returned `unsure` and three model calls failed. The exact incident duration and number of
users affected were not recorded.

## Timeline

| Date | Event |
| --- | --- |
| 24 Nov 2026 | The public walkthrough surfaced `ClientError` in semantic findings. |
| 25 Nov 2026 | A smoke call from the checker container returned 400 `FAILED_PRECONDITION` for the VM location. Azure metadata confirmed East Asia (Hong Kong). |
| 25 Nov 2026 | The team deployed to AWS EC2 Singapore, attached a fixed IP and updated DuckDNS. The model smoke call succeeded. Sandbox checks passed 11/11 and the walkthrough passed for all three samples. |

## Cause and follow-up

The provider declined requests from the original VM region. The deployment checklist
needed a model smoke call from the target region before opening the site. The checker
returned `unsure` when it could not get a semantic verdict.

- The deployment runbook now includes a model reachability check before launch.
- The team attached a fixed IP to the replacement VM and updated the public DNS.
- T99 adds correlation for provider attempts and judge and checker outcomes.
- A separate alert for sustained provider errors remains open. T100 measures judge turnaround.

Evidence: [incident record and walkthrough](../../AI-LOG.md#2026-11-25--t84-follow-up-move-the-deployment-to-aws-singapore-c-hoang)
and [PR #37](https://github.com/tkob-team/LeeTKOB/pull/37).


## Detection and recovery

The deployment operator runs the provider smoke probe from the target checker service
before opening the site. If semantic findings become unsure, correlate the failed
attempts with a submission ID and check the provider error from the same region.
Verify a supported region from the candidate VM before switching DNS, then rerun the
sandbox checks and the submission-to-review walkthrough. Record the DNS change, smoke
results and recovery evidence in the deployment log.

Owner assignment for a separate provider error alert is pending team confirmation.
