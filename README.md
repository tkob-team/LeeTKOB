# LeetKOB

Monorepo:

- `backend/` — Spring Boot (Java 25, Maven wrapper)
- `checker/` — Python 3.12 (uv)
- `frontend/` — React + Vite + TypeScript (Node.js 22); UI from `docs/design-system/`

## Prerequisites

- JDK 25
- [uv](https://docs.astral.sh/uv/)
- Docker (backend tests start PostgreSQL via Testcontainers)
- make
- Node.js 22 (`frontend/.nvmrc`); run `cd frontend && npm ci` once before the checks

On Windows, use WSL and run everything from inside the WSL shell.

Select JDK 25 before running checks (`java -version` must report 25). On macOS,
select that installed JDK for the current shell; on Windows use the WSL toolchain.
Run `uv --version` and `docker info` to confirm uv and the Docker daemon are available.

The four checks need no real credentials or `.env`: Testcontainers supplies the
database and tests use a fake JWT signing key. `uv run --locked` creates the checker
environment from its lockfile. A first run needs network access for dependencies.

For running the application, copy `.env.example` to an untracked `.env` and fill it
privately. Spring Boot does not automatically load a shell `.env` file: export the
listed variables into the application process using your own launcher or IDE.
Never ask an agent to read that file. The model key is not needed for PA#02 tests.

## Checks

```sh
make lint
make format-check
make typecheck
make test
```

## Continuous integration

`.github/workflows/ci.yml` runs on pull requests, pushes to `main`, and pushed
tags matching `pa*` (including `pa2`). It also supports manual runs.

The five check names are `lint`, `format-check`, `typecheck`, `test`, and
`secrets`. The first four execute the exact Makefile commands above with
JDK 25, Python 3.12, and uv 0.13.7. Backend tests start PostgreSQL through
Testcontainers using Docker on the runner. Contract tests added to the backend
test suite run in the same `make test` job.

The `secrets` job checks out all branches and tags and runs Gitleaks 8.30.1 over
the full Git history. Its release archive is checksum-verified, findings are
redacted, and a detected secret fails the job. No model API key is needed for CI.

These five check names are intended for the `main` protection ruleset (T03).
Adding this workflow alone does not configure branch protection. LLM evaluation
is not a required check for PA#02.

## AI agent permissions

Agent rules are in `AGENTS.md`. Claude Code reads `.claude/settings.json`; Codex
reads `.codex/config.toml` and `.codex/rules/`.

Codex only loads the project-level `.codex/` files after you trust the project.
Every developer must do this once on their own machine: open the repository in
Codex and choose to trust the project when prompted (or mark it as `trusted`
under `[projects."<path to this repository>"]` in `~/.codex/config.toml`).
Without it, Codex ignores the permissions in this repository and falls back to
your personal defaults.

To check a command against the rules:

```sh
codex execpolicy check --rules .codex/rules/default.rules -- git push --force origin x
```

Run `python3 scripts/check-agent-permissions.py` for the reproducible command
matrix. See [permission coverage](docs/pa2/agent-permissions.md) for what is
runtime-enforced and what remains agent policy; prefix checks do not establish
interactive enforcement or universal secret-file isolation.

## PA#02 evidence

See [PA2.md](PA2.md) for the evidence links and remaining release-tag step.
The [PostgreSQL queue ADR](docs/decisions/0001-postgresql-judge-queue.md) records
T27. See the [internal judge contract](docs/contract/internal-judge.md) for the
queue, worker and recovery rules.

## PA#03 submission and judge

Build the trusted sandbox image on the Linux Docker daemon that the judge worker uses.
The daemon must provide cgroup v2 with CPU, memory, swap and PID accounting.

```sh
docker build -t leetkob-sandbox:pa3 sandbox
(cd backend && sh ./mvnw -B -ntp package)
java -jar backend/target/backend-0.0.1-SNAPSHOT.jar judge-worker
```

The HTTP API uses the same jar without the `judge-worker` argument. Run them as
separate processes against the same PostgreSQL database. The judge worker needs the
Docker CLI and permission to talk to its daemon. In a deployment, mount the Docker
socket only in the judge worker service. Its sandbox containers receive neither the
socket nor the service environment. `JUDGE_SANDBOX_IMAGE` can select a trusted image
already available to that daemon.

The `sandbox` job runs on PRs, `main`, and the `pa3` tag. Reproduce its sandbox
checks (nine minimums, 11 tests) and the worker restart test after building the image.

```sh
(cd backend && JUDGE_SANDBOX_TESTS=1 sh ./mvnw -B -ntp \
  -Dtest=DockerSandboxTest,JudgeWorkerRestartTest test)
```

Students select a lab from their class and see the latest submission in the
[student polling contract](docs/contract/get-student-judge-status.md). The frontend
needs the authenticated API routes on its origin or through the configured API base URL.
For the original trusted-sample baseline, see the
[Docker prototype timings](docs/decisions/0002-docker-judge-prototype.md).

The local receipt script measures HTTP receipt latency. Set `LEETKOB_LOAD_TOKEN` to a
fixture student's JWT and `LEETKOB_LAB_ID` to its lab UUID in your shell.

```sh
node scripts/submission-load.mjs --url http://127.0.0.1:8080 --lab "$LEETKOB_LAB_ID" --count 8 --concurrency 4
```

## Checker command

One command reads a dataset folder (layout in [eval/dev/README.md](eval/dev/README.md)) and
writes one prediction line per (solution, constraint). It reads only each problem's
`statement.md` and `constraints.json`; there is no per-problem configuration. Ban-list
constraints ("Do not use" / "Do not call") go to the syntax-tree hard rules; semantic
constraints go to the Gemini judge (`checker/src/checker/model_judge.py`). Without
`GEMINI_API_KEY` and `GEMINI_MODEL` they are `unsure`.

```sh
cd checker && uv run leetkob-check --data ../eval/dev --out ../out/predictions.jsonl
```

Before a call, comments are replaced by spaces (line numbers stay the same) and 8-digit
student IDs and email addresses are masked; no solution id, file name or identity is sent.
The model answers JSON (`verdict`, `evidence`, `reason`; no deduction field), checked again
locally. Options: `--call-log <file>` writes one line per pair (hard rule or model call,
with response id, model, prompt, tokens, latency and a cost estimate at paid-tier prices
although calls run on the Free tier); `--concurrency N` (default 1); `--timeout S` (default
30); `--no-fallback` uses only `GEMINI_MODEL` (use it for dev-set runs that are committed).
`GEMINI_FALLBACK_MODELS` is a comma-separated list tried in order after a daily-quota 429;
other 429s are retried 3 times with backoff and then give `unsure`. `GEMINI_RPM` paces the
calls (default 15 per minute).

`MODEL_OFF=1` runs the hard rules only: semantic constraints are `unsure` and no network
client is imported or created. Docker image (dependencies are installed at build time, so
the run needs no network):

```sh
docker build -t leetkob-checker checker
docker run --rm --network none --memory 1g --pids-limit 256 -e MODEL_OFF=1 \
  -v "$PWD/eval/dev:/data:ro" -v "$PWD/out:/out" \
  leetkob-checker --data /data --out /out/predictions.jsonl
```

Score the file with the lecturer's scorer. Exit 0 means every threshold is met, 1 means a
threshold failed, 2 means the file is invalid:

```sh
node eval/dev/eval.mjs --data eval/dev --predictions out/predictions.jsonl
```

Our own cases live in `eval/own/` (same layout, new problems); score them with
`--data eval/own`. Never edit `eval/dev/`: it is a byte-for-byte copy of the lecturer's set.

## Check worker

`leetkob-check-worker` turns AC submissions into findings. The judge inserts a `check_jobs`
row with every AC verdict; the worker claims the oldest job with `FOR UPDATE SKIP LOCKED`
and a lease, runs the same pipeline as the checker command (hard rules first, then the
Gemini judge, with limits turning into `unsure`), and in one transaction writes
`model_calls`, then `findings` (`ON CONFLICT DO NOTHING`, evidence with original lines),
then marks the job finished. A write is accepted only under the live lease, so a job that
is re-claimed after its lease expired still ends with one set of findings. Rules:
[internal judge contract](docs/contract/internal-judge.md) and
[PA3 data boundaries](docs/contract/pa3-boundaries.md).

It reads the backend's database settings: `DB_URL` in JDBC form
(`jdbc:postgresql://host:port/database`), `DB_USER`, `DB_PASSWORD`, plus the Gemini
variables. The worker is the only process that receives `GEMINI_API_KEY`.

```sh
cd checker && uv run leetkob-check-worker            # poll every 2 s; --once handles one job
docker run --rm -e DB_URL -e DB_USER -e DB_PASSWORD -e GEMINI_API_KEY -e GEMINI_MODEL \
  leetkob-checker worker --lease-seconds 600
```

The first argument of the image picks the process: `worker` starts the worker; anything else
(or `check`) runs the checker command, and the image's entrypoint removes `GEMINI_API_KEY`
for it. Set `--lease-seconds` (default 600) longer than all model calls of one submission;
the worker does not renew its lease yet.

## Model and cost

The checker reviews accepted submissions against a lab's constraints with a Google
Gemini model. The model never decides a grade or a deduction; a TA reviews every proposal.

| Item | Value |
| --- | --- |
| Provider | Google Gemini API |
| Model in use | `gemini-3.5-flash-lite` (set with `GEMINI_MODEL`); `GEMINI_FALLBACK_MODELS` may list `gemini-3.1-flash-lite` for daily-quota fallback, but committed dev-set runs use `--no-fallback` |
| Key | `leetkob-pa02`, created on 2026-11-10 in Google AI Studio project `LeeTKOB` (`gen-lang-client-0403299997`). The holder keeps it in their private `GEMINI_API_KEY`; its value was not copied into this repo, logs or chat. CI and unit tests use no key. |
| Real cost | **USD 0.** The key's Google project has no billing account, so calls run on the Free tier and cannot be charged. Enabling billing needs a new team decision. |
| Per-lab call cap | Planned, not implemented: 800 model calls per lab; beyond it verdicts become `unsure` (FAQ-09) |

### Measured tokens and the cost of one lab

Measured on the committed dev-set run
[`eval/runs/2026-11-23-gemini-3.5-flash-lite/calls.jsonl`](eval/runs/2026-11-23-gemini-3.5-flash-lite/calls.jsonl):
47 model calls (one per semantic pair; ban-list pairs never call the model), average
**944.9 input tokens** and **74.6 output tokens** per call (output includes thinking tokens).

Paid-tier prices, used only as an estimate (USD per 1M tokens, Standard, input / output):
`gemini-3.5-flash-lite` 0.30 / 2.50 and `gemini-3.1-flash-lite` 0.25 / 1.50, from the
[Gemini API pricing page](https://ai.google.dev/gemini-api/docs/pricing) read on 2026-11-23.

Average estimated cost of one call = (944.9 × 0.30 + 74.6 × 2.50) / 1,000,000 = USD 0.00047
(mean of the logged `cost_usd`: USD 0.00046994).

One lab: 80 submissions × 2 semantic constraints (assumption) × USD 0.00046994
= 160 calls × USD 0.00046994 = **USD 0.075** at paid-tier prices. The real cost is USD 0
because the Free tier is used. 160 calls fit the 500-request daily quota of the key; at the
default 15 requests per minute they take about 11 minutes.

## Class management (T29)

Administrators can create classes and assign existing TA accounts; students join
with an invitation code. Class lists, details and rosters enforce class membership.
See the [class API contract](docs/contract/classes.md) for endpoints and role rules.
Account/password login and production JWT issuance remain T28; this feature uses
the existing JWT verifier and persisted account roles.

## Deployment runbook

One Linux VM runs everything with [deploy/docker-compose.yml](deploy/docker-compose.yml).
Only `caddy` publishes ports, 80 and 443: it gets a Let's Encrypt certificate for
`LEETKOB_DOMAIN`, redirects HTTP to HTTPS and proxies to `web` (nginx) over the private `edge`
network. `web` serves the frontend build and proxies `/api/` to the API on the same origin.
PostgreSQL (persistent volume `pgdata`), `web`, `api`, `judge-worker` and `checker-worker` have
no published port.

| Service | Image | Receives |
| --- | --- | --- |
| `postgres` | `postgres:17-alpine` | `DB_USER`, `DB_PASSWORD` |
| `api` | `leetkob-api` (backend jar) | database, `JWT_SECRET` |
| `judge-worker` | `leetkob-judge-worker` (same backend jar), `judge-worker` | database and private sandbox proxy |
| `checker-worker` | `leetkob-checker`, `worker` | database, Gemini variables; the only service with `GEMINI_API_KEY` |
| `caddy` | `caddy:2.10.2-alpine` + [deploy/Caddyfile](deploy/Caddyfile) | `LEETKOB_DOMAIN`, optional `ACME_EMAIL`; volumes `caddy_data` (certificates) and `caddy_config` |
| `web` | `leetkob-web` (nginx + `frontend/dist`) | nothing |
| `seed` (profile `seed`) | `leetkob-api`, `seed` | database, `SEED_*_PASSWORD` |
| `sandbox` (profile `build`) | `leetkob-sandbox:pa3` from `sandbox/` | build only |
| `sandbox-proxy` | backend jar and Docker CLI | host Docker socket |
| `sandbox-check` (profile `check`) | JDK + backend sources | private sandbox proxy |

Each service lists its variables explicitly; none loads the whole `deploy/.env`.
HSTS is not enabled yet, so the site can still go back to plain HTTP if the certificate fails
(step 7).

The login attempt limit counts the client address. Caddy replaces any `X-Forwarded-For` the
client sends with the client address; nginx trusts that header only from the `edge` subnet
(`172.29.250.0/28`, where caddy is the only other member) and forwards it to the API.
`sh deploy/check-client-ip.sh` proves it on a development machine with Docker: it runs the
real caddy, `nginx.conf` and networks with an echo server in place of the API and expects
`PASS: the API sees the client address; caddy's address and spoofed headers are ignored`. It
fails if the nginx `real_ip` lines are removed (the API then sees caddy's address). Do not run
it on the VM while the stack is up: the stack already owns the `edge` subnet.

nginx answers 404 for any path with a segment that starts with a dot (`/.env`, `/.git/config`)
instead of falling back to `index.html`. `sh deploy/check-dotfiles.sh` runs the real
`nginx.conf` in the nginx image with a stub page and expects
`PASS: dot paths get 404; client-side routes still get index.html`.

### 1. Set up the VM

Ubuntu 24.04 LTS, at least 2 vCPU and 4 GB RAM, inbound TCP 22, 80 and 443 open (on AWS, in
the instance's Security Group: add inbound rules for HTTP 80 and HTTPS 443 from `0.0.0.0/0`;
port 80 must stay open for the Let's Encrypt HTTP challenge and the redirect). Install Docker Engine
with the Compose plugin ([docs.docker.com/engine/install/ubuntu](https://docs.docker.com/engine/install/ubuntu/)),
then add your user to the `docker` group and log in again.

Choose the cloud region first: the Gemini API refuses calls from some locations. A VM in
Azure East Asia (Hong Kong) got `400 FAILED_PRECONDITION: User location is not supported for
the API use`, so every semantic constraint became `unsure`. The deployment now runs on AWS
EC2 in Singapore (`ap-southeast-1`), where the call succeeds. Whatever the provider, make the
model reachability check of step 3 before opening the site. Give the VM a fixed public address
(an AWS Elastic IP, for example): a dynamic address changes when the VM is stopped and
started, and the DNS name would then point nowhere. Ubuntu images on AWS use the user
`ubuntu` instead of `azureuser`.

The sandbox needs cgroup v2 with memory, CPU, PID **and swap** accounting. If
`memory.swap.max` is missing, `sandbox/supervise.py` returns an infrastructure error for every
submission, so no student gets a verdict.

```sh
stat -fc %T /sys/fs/cgroup                    # cgroup2fs
docker info --format 'cgroup={{.CgroupVersion}} swap={{.SwapLimit}}'   # cgroup=2 swap=true
ls /sys/fs/cgroup/system.slice/memory.swap.max
```

If one of them fails, add `systemd.unified_cgroup_hierarchy=1 swapaccount=1` to
`GRUB_CMDLINE_LINUX` in `/etc/default/grub`, run `sudo update-grub`, reboot and check again.

### 2. Configure and build

```sh
git clone https://github.com/tkob-team/LeeTKOB.git leetkob && cd leetkob
cp deploy/.env.example deploy/.env && chmod 600 deploy/.env
stat -c %g /var/run/docker.sock               # DOCKER_GID
openssl rand -base64 48                       # a JWT_SECRET
nano deploy/.env                              # LEETKOB_DOMAIN, ACME_EMAIL, DB_*, JWT_SECRET, DOCKER_GID, GEMINI_*
docker compose -f deploy/docker-compose.yml --profile build build
```

`--profile build` builds the configured sandbox image (default `leetkob-sandbox:pa3`) from
`sandbox/` on the VM's existing daemon. The private proxy starts sandbox containers
and is the only service that mounts the daemon socket. It checks that the selected image
is available before the worker takes jobs.

### 3. Mandatory check before opening the site

Run the sandbox probes (`DockerSandboxTest` with `JUDGE_SANDBOX_TESTS=1`) through the VM's proxy on the existing daemon. Do not give the URL to anyone until it reports `Tests run: 11, Failures: 0, Errors: 0,
Skipped: 0`.

```sh
docker compose -f deploy/docker-compose.yml --profile check run --rm --build sandbox-check
```

Also check that the VM can reach the model. This runs one call with the `checker-worker`
variables and prints only the reply or Google's error, never the key. The image's
entrypoint removes `GEMINI_API_KEY` for every argument except `worker`, so the command
replaces the entrypoint. Expect `OK: ok`; a `User location is not supported` error means the
region cannot be used.

```sh
docker compose -f deploy/docker-compose.yml run --rm --no-deps \
  --entrypoint /app/.venv/bin/python checker-worker -c '
import os
from google import genai
c = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
r = c.models.generate_content(model=os.environ["GEMINI_MODEL"], contents="Reply with the single word: ok")
print("OK:", r.text)
'
```

### 4. Start and seed

```sh
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml ps
read -rs SEED_ADMIN_PASSWORD; read -rs SEED_TA_PASSWORD; read -rs SEED_STUDENT_PASSWORD
export SEED_ADMIN_PASSWORD SEED_TA_PASSWORD SEED_STUDENT_PASSWORD
docker compose -f deploy/docker-compose.yml --profile seed run --rm seed
unset SEED_ADMIN_PASSWORD SEED_TA_PASSWORD SEED_STUDENT_PASSWORD
```

On the first `up -d`, `checker-worker` can start before the API has applied the Flyway
migrations and restart a few times with `relation "check_jobs" does not exist` in its log
(seen on both VMs, three restarts). It stays up once the API has finished; wait a minute and
check `docker compose -f deploy/docker-compose.yml ps` before testing.

The seed creates `admin@leetkob.test`, `ta1@leetkob.test`, `ta2@leetkob.test`,
`sv1@leetkob.test`, `sv2@leetkob.test`, the classes "Lớp thử nghiệm 1" (ta1, sv1, sv2) and
"Lớp thử nghiệm 2" (ta2), and no lab. Each password needs 12 characters to 72 bytes. A second
run creates nothing and keeps existing passwords (`accountsCreated=0 classesCreated=0`).

### 5. Update to a new version

```sh
git pull --ff-only
docker compose -f deploy/docker-compose.yml --profile build build
docker compose -f deploy/docker-compose.yml up -d
```

The API applies new Flyway migrations at start. If `sandbox/` or `DockerSandbox` changed,
run the check of step 3 again.

When moving from the HTTP-only deployment to HTTPS (T109): open TCP 443 in the Security Group,
add `LEETKOB_DOMAIN=tkob-leetkob.duckdns.org` (and optionally `ACME_EMAIL`) to `deploy/.env`,
then run the three commands above. `web` gives up port 80 and `caddy` takes 80 and 443; the
DNS name must already point at the VM. Check:

```sh
curl -sI http://tkob-leetkob.duckdns.org | head -3     # 308 Permanent Redirect to https://
curl -sI https://tkob-leetkob.duckdns.org | head -1    # HTTP/2 200
```

### 6. Logs and restarts

```sh
docker compose -f deploy/docker-compose.yml logs -f --tail=200 api judge-worker checker-worker
docker compose -f deploy/docker-compose.yml logs -f --tail=200 caddy   # certificate and access log
docker compose -f deploy/docker-compose.yml logs --tail=50 web         # client addresses as nginx sees them
docker compose -f deploy/docker-compose.yml restart judge-worker checker-worker
docker compose -f deploy/docker-compose.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" leetkob' > "backup-$(date +%F).sql"
```

A restarted worker leaves its job leased; another claim takes it after the lease expires
(60 s for the judge, `--lease-seconds 600` for the checker).

### 7. Go back to plain HTTP

If the certificate cannot be obtained or renewed (caddy log shows `obtaining certificate`
errors), serve HTTP only without changing the compose file: set
`LEETKOB_DOMAIN=http://tkob-leetkob.duckdns.org` in `deploy/.env` and run
`docker compose -f deploy/docker-compose.yml up -d caddy`. Caddy then listens on port 80 only,
with no redirect and no certificate. Undo by restoring the bare domain and running the same
command. HSTS is off, so no browser is forced to use HTTPS, but caddy's redirect is a `308
Permanent Redirect` that browsers cache: a browser that already followed it keeps going to
`https://` until its cache is cleared (or open the site in a private window). The frontend's
submission key works on HTTP since #39.
