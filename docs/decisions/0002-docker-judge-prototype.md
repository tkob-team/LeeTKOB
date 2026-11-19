# ADR 0002: Docker for the local judge prototype

Status: selected for the local prototype on 2026-11-19 (T22). Record the team decision in the tracker after review.

Docker Desktop started successfully and ran the C++17 sample with the expected output. Use Docker for the next sandbox iteration. Judge0 self-hosted remains the fallback if Docker cannot run in the target environment.

## Reproduction

```sh
docker pull gcc:14.3.0
python3 scripts/try-docker-judge.py --runs 5
```

The script runs one fixed source file. It reads the test input `21`, compiles with `g++ -std=c++17 -O2` and checks exact stdout `42` followed by a newline. It disables container networking, uses a non-root uid, drops capabilities, and uses a read-only root filesystem with a size-limited temporary working directory. The run enforces CPU, memory, process and wall-time limits. It passes no application secrets and mounts no host project files.

## Measured on 2026-11-19

| Item | Value |
| --- | --- |
| Engine | Docker Desktop Linux engine 29.9.3 on Windows |
| Image | gcc:14.3.0, linux/amd64 |
| Image digest | sha256:4e2d22617a3b4af1ad0150ba6ca3cb8a975c44c1abac6f9a09870b93cb5c363b |
| Result | 5 of 5 runs produced the expected output |
| Elapsed per run (ms) | 9427.9, 610.7, 535.5, 528.9, 541.1 |
| Median (ms) | 541.1 |

Each elapsed time includes the Docker CLI, container startup, compilation, execution and cleanup. The first measurement starts after the image pull. These measurements cover one sequential sample. They provide the T22 prototype baseline. T53 still requires verification against the five requirements in the official brief before enabling execution of student submissions. The prototype runs separately from the submission API and worker.
