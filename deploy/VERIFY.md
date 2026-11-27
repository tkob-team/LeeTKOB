# Local and VM verification

## Local sandbox

Use a separate Compose project and a separate PostgreSQL volume. Supply a synthetic
configuration outside Git. On Windows keep the configuration and temporary output
in D:\\Cache. Set WEB_BIND to 127.0.0.1, WEB_PORT to 18080, OPERATIONS_PORT to 19108 and
MODEL_OFF to 1. Use a separate Compose project name such as leetkob-local.

1. Build the sandbox image on the current Docker daemon and build the Compose images.
2. Start the stack, run the regular seed and use the TA flow to create an open fixture lab.
3. Run sandbox-check with the same Compose file and project name. It uses the proxy
   through the same private network as the judge worker.
4. Submit a fixture C++ solution through Nginx. Observe the authenticated SSE snapshots
   and find its receipt, sandbox and checker events by submission ID.
5. Start the observe profile and verify metrics and alert state transitions with fixtures.
6. Use a dedicated second lab and the synthetic load seed. Run the load driver and reconcile
   the results after the queue drains.

## VM handoff

The operator builds the sandbox image on the existing daemon and sets DOCKER_GID to its
socket group. The proxy is the only service with a Docker socket bind. Run the local
sequence on the VM, verify the sandbox suite before opening the site and capture the
job counts, smoke submission ID, alert state and load audit. Capture aggregate evidence
without credentials. The load run needs a dedicated class and an agreed test window.

If the proxy fails before rollout completes, stop the judge worker and preserve the
database and queued jobs. Save the infrastructure error and proxy logs, then redeploy
the last approved release using the operator runbook. The new worker has no direct
socket fallback. The lease rules make incomplete work eligible for recovery.
