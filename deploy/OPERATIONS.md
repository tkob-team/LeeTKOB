# LeetKOB operations dashboard

Start the optional dashboard after database migrations have completed.

```sh
docker compose -f deploy/docker-compose.yml --profile observe up -d observability
ssh -L 9108:127.0.0.1:9108 operator@vm
```

Open http://127.0.0.1:9108/ locally. The VM binds the dashboard and metrics to loopback.
The sampler uses read-only transactions and refreshes every 30 seconds.

- Queue depth separates ready jobs from jobs with a live lease for both queues.
- Judge turnaround measures enqueue to stored verdict. The dashboard shows p95 over
  15 minutes. It also shows p95 wait before the first claim and p95 grading duration.
- Model p95 and estimated cost use individual provider attempts, including retries.
  The dashboard counts attempts without cost data separately. Historical jobs without
  timing or attempt rows contribute only to compatible metrics.
- Failure metrics show judge infrastructure errors and model timeouts.
- The proposed SLO is at least 95% of eligible judge jobs with a verdict within 30 seconds over 15
  minutes. Jobs older than 30 seconds are eligible. An eligible job still unfinished or
  finished late violates the SLO. Older unfinished jobs still count until resolved.
  An empty cohort means no data. A database outage means unknown.
  An active alert stays open during no data or a database outage. A fresh eligible
  sample meeting the SLO resolves it.
  Entering firing or resolving the alert emits a `judge_turnaround_slo` event to the service log.

Use a disposable database for an alert drill. Add one synthetic unfinished job enqueued more
than 30 seconds ago and confirm a firing event. Confirm recovery after resolving the
job and bringing the sample ratio back to 95% or more. Record the event timestamp, sample size and ratio.
