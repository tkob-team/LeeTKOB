# T102 load test runbook

Agree on a test window with the deployment operator and use an empty lab in a dedicated
synthetic class. Create the lab through the TA flow and configure a test for the driver's
fixed C++ submission. Leave the lab open long enough for the load and judge queue drain.

On the VM, set the dedicated class UUID and read a randomly generated seed secret of at
least 32 characters without echo. Keep the secret outside Git and do not use a real
account password. The one-shot seed creates 80 class-scoped synthetic accounts and
verifies existing accounts on repeat runs.

```sh
export LOAD_SEED_CLASS_ID=CLASS_UUID
read -rs LOAD_SEED_SECRET
export LOAD_SEED_SECRET
docker compose -f deploy/docker-compose.yml --profile load run --rm seed-load
```

On the VM, find the deployed nginx container address on the Compose default
network. The public ports belong to Caddy, so use the private nginx address for
this application load run.

```sh
WEB_CONTAINER=$(docker compose -f deploy/docker-compose.yml ps -q web)
docker inspect --format '{{range $name, $net := .NetworkSettings.Networks}}{{println $name $net.IPAddress}}{{end}}' "$WEB_CONTAINER"
```

On the operator machine, set WEB_IP to the address from the network ending in
_default (normally leetkob_default). Keep the tunnel open while the driver runs.
Use the same seed secret in the local environment. Login happens before the
timed workload. An operator can also omit --seed-class and provide one
short-lived student JWT per stdin line from a protected file.

```sh
WEB_IP=NGINX_IP_FROM_DEFAULT_NETWORK
ssh -N -L "127.0.0.1:18080:$WEB_IP:80" operator@vm
```

Record the private nginx route in the result. The receipt latency is for this route.

In a second terminal, choose a fresh path for the run manifest outside Git.

```sh
node scripts/submission-load.mjs --pa5-load --url http://127.0.0.1:18080 \
  --lab LAB_UUID --seed-class CLASS_UUID --receipt-manifest /tmp/leetkob-receipts.json > load/RESULT.md
unset LOAD_SEED_SECRET
```

The driver launches eight requests each second for ten seconds. It verifies 80 distinct
HTTP 201 receipts, matching student and lab IDs, and a server receipt timestamp span under
ten seconds. The report includes API receipt p95 and aggregate outcomes. The separate receipt
manifest contains submission IDs, student IDs and server receipt timestamps. It contains
no credentials. Keep the exact manifest for the reconciliation. A failed run with an
empty or failed manifest cannot pass reconciliation.

After the queue drains, run the reconciliation query from the checkout on the VM.
Copy the manifest to a protected path on the VM through the existing operator SSH
connection. Use the same lab UUID and append the result to the report.

```sh
LAB_ID=LAB_UUID
MANIFEST=/tmp/leetkob-receipts.json
docker compose -f deploy/docker-compose.yml exec -T postgres sh -c \
  'exec psql -X -v ON_ERROR_STOP=1 -v "lab_id=$1" -v "manifest_json=$2" -U "$POSTGRES_USER" leetkob' \
  audit "$LAB_ID" "$(cat "$MANIFEST")" < load/audit.sql
```

Record submissions, unique students, jobs, terminal verdicts, measured grading samples
and grading p95. The SQL reports pass only if the 80 manifest receipts match the persisted submissions
for that lab, each has a job and terminal verdict, and there are no extra submissions.
Complete grading latency evidence also requires 80 grading duration samples from the
observability migration V5. On earlier schemas the audit still reconciles results and
reports grading p95 as unavailable. Use a fresh lab for each measured run.
Unset the seed secret on the VM and retain synthetic records until the operator signs
off on the evidence.
