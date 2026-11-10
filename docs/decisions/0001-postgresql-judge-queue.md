# ADR 0001: PostgreSQL judge queue

Status: accepted team decision (2026-11-05, tracker Decisions sheet; T27).

Use a PostgreSQL table behind a `JudgeQueue` interface rather than RabbitMQ.
Creating a submission and its future grading job must share a database transaction.
This avoids losing grading work between storing the submission and publishing a
message, without introducing an outbox and another service.

Workers claim available jobs with `FOR UPDATE SKIP LOCKED`, commit the claim
promptly, and release database locks before compiling/running student code.
Recovery from a dead worker and idempotent result writes belong to T31.

Queue depth can be measured with SQL. Sandbox CPU capacity is expected to be the
main constraint; actual throughput must be measured by T22/T32 and later load tests.

This document records the decision only. PA#02 has the submission endpoint and
returns `queued`; the queue, worker, retry/recovery and sandbox are not yet implemented.
