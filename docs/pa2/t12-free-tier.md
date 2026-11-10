# T12: Gemini API key, Free tier

Hoang explicitly approved creating the project/key and keeping Free tier on
2026-11-10. The account setup was performed through Google AI Studio in Chrome.

| Item | Verified value |
| --- | --- |
| Project | LeeTKOB |
| Project ID | gen-lang-client-0403299997 |
| Key display name | leetkob-pa02 |
| Billing tier | Free tier |
| Spend page | There is no billing currently set up for this project |
| Paid spending cap | Not configured; the earlier USD 20/month proposal was not applied |

Evidence: [masked key list](t12-free-tier-api-key.png),
[project Spend page showing no billing](t12-free-tier-no-billing.png).

The key value is retrievable by the owner in
[AI Studio](https://aistudio.google.com/api-keys?projectFilter=gen-lang-client-0403299997).
It was not displayed in chat, written to logs, committed, or inserted into `.env`.
No other project's key or billing configuration was changed. No payment method,
billing account, paid plan or real model call was added.

T12 account provisioning is complete under the user's chosen Free-tier-only
policy. This is not evidence that a configurable dollar spending cap was set.
If the rubric literally requires such a cap, explain this distinction rather
than claiming the old USD 20 value was configured. Free quotas and model
availability still need to be checked for the model trial (T23).
