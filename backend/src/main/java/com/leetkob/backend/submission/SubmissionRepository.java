package com.leetkob.backend.submission;

import com.leetkob.backend.judge.JudgeQueue;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

/** SQL access for users, class membership, labs and submissions. */
@Repository
class SubmissionRepository {

  /** A lab as seen by a member of its class. */
  record Lab(UUID id, Instant opensAt, Instant dueAt) {}

  /** A stored submission. */
  record Stored(
      UUID id, UUID labId, UUID studentId, String code, int sizeBytes, Instant submittedAt) {}

  record StudentLab(UUID id, String title, UUID latestSubmissionId) {}

  record Status(
      UUID id,
      String status,
      boolean counted,
      JudgeQueue.Verdict verdict,
      List<JudgeQueue.TestResult> tests) {}

  private final JdbcClient jdbc;
  private final JsonMapper json;

  SubmissionRepository(JdbcClient jdbc, JsonMapper json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  boolean userExists(UUID userId) {
    return jdbc.sql("select count(*) from users where id = ?")
            .param(userId)
            .query(Integer.class)
            .single()
        > 0;
  }

  Optional<Lab> findLabForMember(UUID labId, UUID userId) {
    return jdbc.sql(
            """
            select l.id, l.opens_at, l.due_at
            from labs l
            join class_members m on m.class_id = l.class_id
            where l.id = ? and m.user_id = ?
            """)
        .params(labId, userId)
        .query((rs, row) ->
            new Lab(
                rs.getObject("id", UUID.class),
                rs.getTimestamp("opens_at").toInstant(),
                rs.getTimestamp("due_at").toInstant()))
        .optional();
  }

  Optional<Stored> find(UUID studentId, String key) {
    return jdbc.sql(
            """
            select id, lab_id, student_id, code, size_bytes, submitted_at
            from submissions
            where student_id = ? and idempotency_key = ?
            """)
        .params(studentId, key)
        .query((rs, row) ->
            new Stored(
                rs.getObject("id", UUID.class),
                rs.getObject("lab_id", UUID.class),
                rs.getObject("student_id", UUID.class),
                rs.getString("code"),
                rs.getInt("size_bytes"),
                rs.getTimestamp("submitted_at").toInstant()))
        .optional();
  }

  List<StudentLab> labsForStudent(UUID studentId) {
    return jdbc.sql(
            """
            select l.id, l.title, latest.id as latest_submission
            from labs l
            join class_members m on m.class_id = l.class_id
            left join lateral (
              select s.id from submissions s
              where s.lab_id = l.id and s.student_id = m.user_id and s.submitted_at < l.due_at
              order by s.submitted_at desc, s.id desc
              limit 1
            ) latest on true
            where m.user_id = ?
            order by l.opens_at desc, l.id
            """)
        .param(studentId)
        .query((row, number) ->
            new StudentLab(
                row.getObject("id", UUID.class),
                row.getString("title"),
                row.getObject("latest_submission", UUID.class)))
        .list();
  }

  Optional<Status> status(UUID labId, UUID submissionId, UUID studentId) {
    return jdbc.sql(
            """
            select s.id, j.result::text as result_json,
              case when j.finished_at is not null then 'completed'
                   when j.lease_expires_at > statement_timestamp() then 'grading'
                   else 'queued' end as status,
              s.submitted_at < l.due_at and not exists (
                select 1 from submissions later
                where later.lab_id = s.lab_id and later.student_id = s.student_id
                  and (later.submitted_at, later.id) > (s.submitted_at, s.id)
                  and later.submitted_at < l.due_at
              ) as counted
            from submissions s
            join labs l on l.id = s.lab_id
            join class_members m on m.class_id = l.class_id and m.user_id = s.student_id
            left join judge_jobs j on j.submission_id = s.id
            where s.lab_id = ? and s.id = ? and s.student_id = ?
            """)
        .params(labId, submissionId, studentId)
        .query((row, number) -> {
          String stored = row.getString("result_json");
          JudgeQueue.Result result =
              stored == null ? null : json.readValue(stored, JudgeQueue.Result.class);
          return new Status(
              row.getObject("id", UUID.class),
              row.getString("status"),
              row.getBoolean("counted"),
              result == null ? null : result.verdict(),
              result == null ? List.of() : result.tests());
        })
        .optional();
  }

  /**
   * Inserts the submission and its grading job atomically unless the student already used the key.
   * A concurrent insert with the same key waits for the winner and then inserts neither row.
   *
   * @return true if a row was inserted
   */
  boolean insertIfAbsent(Stored submission, String key) {
    return jdbc.sql(
                """
                with created as (
                  insert into submissions
                    (id, lab_id, student_id, idempotency_key, code, size_bytes, submitted_at)
                  values (?, ?, ?, ?, ?, ?, ?)
                  on conflict (student_id, idempotency_key) do nothing
                  returning id, submitted_at
                )
                insert into judge_jobs (submission_id, enqueued_at)
                select id, submitted_at from created
                """)
            .params(
                submission.id(),
                submission.labId(),
                submission.studentId(),
                key,
                submission.code(),
                submission.sizeBytes(),
                Timestamp.from(submission.submittedAt()))
            .update()
        == 1;
  }
}
