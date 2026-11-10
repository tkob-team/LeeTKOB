# T14 — Fresh-clone verification on the shared team workstation

On 2026-11-10, Hoang clarified that Hoa and Hiep also work on this machine and authorized completing their tasks here. This is team evidence on native macOS arm64, not a claim about WSL or a separate personal machine.

A new clone was fetched from GitHub at `cebb551080d590681207c10e09f39d9f0462008e` into `outputs/t14/fresh-clone`. Following README, JDK 25 was selected, Docker and uv were used, and the exact `make lint`, `make format-check`, `make typecheck`, `make test` commands all exited 0. No real credentials or `.env` were used.

See [machine-readable results](logs/t14/results.json) and [complete make output](logs/t14/make-logs.zip). The clone was clean when verification began.
