package com.leetkob.backend.judge;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

/** PostgreSQL implementation. Both state transitions are single SQL statements. */
@Repository
class PostgresJudgeQueue implements JudgeQueue {

  private final JdbcClient jdbc;
  private final JsonMapper json;

  PostgresJudgeQueue(JdbcClient jdbc, JsonMapper json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  @Override
  public Optional<Claim> claim(Duration lease) {
    long millis = lease.toMillis();
    if (millis < 1) {
      throw new IllegalArgumentException("The lease must be at least one millisecond.");
    }
    return jdbc.sql(
            """
            with candidate as (
              select submission_id
              from judge_jobs
              where finished_at is null
                and (lease_expires_at is null or lease_expires_at <= statement_timestamp())
              order by enqueued_at, submission_id
              limit 1
              for update skip locked
            )
            update judge_jobs j
            set lease_token = :token,
                lease_expires_at = clock_timestamp() + :millis * interval '1 millisecond'
            from candidate c
            join submissions s on s.id = c.submission_id
            where j.submission_id = c.submission_id
            returning j.submission_id, s.lab_id, s.code, j.lease_token
            """)
        .param("token", UUID.randomUUID())
        .param("millis", millis)
        .query((row, number) ->
            new Claim(
                row.getObject("submission_id", UUID.class),
                row.getObject("lab_id", UUID.class),
                row.getString("code"),
                row.getObject("lease_token", UUID.class)))
        .optional();
  }

  @Override
  public boolean complete(Claim claim, Result result) {
    return jdbc.sql(
                """
                with locked_job as materialized (
                  select submission_id, lease_expires_at
                  from judge_jobs
                  where submission_id = :submissionId and lease_token = :token
                    and finished_at is null
                  for update
                ), completion as materialized (
                  select submission_id, lease_expires_at, clock_timestamp() as completed_at
                  from locked_job
                )
                update judge_jobs j
                set result = cast(:result as jsonb), finished_at = c.completed_at,
                    lease_token = null, lease_expires_at = null
                from completion c
                where j.submission_id = c.submission_id and c.lease_expires_at > c.completed_at
                """)
            .param("result", json.writeValueAsString(result))
            .param("submissionId", claim.submissionId())
            .param("token", claim.leaseToken())
            .update()
        == 1;
  }
}
