# T14 — Fresh-clone verification on the shared team workstation

On 2026-11-10, Hoang clarified that Hoa and Hiep also work on this machine and authorized completing their tasks here. This is team evidence on native macOS arm64, not a claim about WSL or a separate personal machine.

A new clone was fetched from GitHub at `cebb551080d590681207c10e09f39d9f0462008e` into `outputs/t14/fresh-clone`. Following README, JDK 25 was selected, Docker and uv were used, and the exact `make lint`, `make format-check`, `make typecheck`, `make test` commands all exited 0. No real credentials or `.env` were used.

See [machine-readable results](logs/t14/results.json) and [complete make output](logs/t14/make-logs.zip). The clone was clean when verification began.

## WSL re-check on Windows (2026-11-11)

Hiep repeated the check on Windows 11 with WSL (Ubuntu 24.04, OpenJDK 25.0.4.1, uv 0.13.7, Docker Desktop). A new clone of `https://github.com/tkob-team/LeeTKOB.git` at `0c7266d` (merge of PR #16) was made beside the repository, README was followed, and `make lint`, `make format-check`, `make typecheck`, `make test` all exited 0 (backend 50 tests, checker 1 test). The clone had no tracked changes afterwards. No real credentials or `.env` were used.

See [results](logs/t14-wsl/results.json) and [combined make output](logs/t14-wsl/make-logs.txt). A first attempt in the same session failed all four commands because the run script used a non-login shell without uv on `PATH`; that was a harness error, not a repository failure, and the run above is a new clone.
