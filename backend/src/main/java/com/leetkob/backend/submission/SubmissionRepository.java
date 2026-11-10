package com.leetkob.backend.submission;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** SQL access for users, class membership, labs and submissions. */
@Repository
class SubmissionRepository {

  /** A lab as seen by a member of its class. */
  record Lab(UUID id, Instant opensAt, Instant dueAt) {}

  /** A stored submission. */
  record Stored(
      UUID id, UUID labId, UUID studentId, String code, int sizeBytes, Instant submittedAt) {}

  private final JdbcClient jdbc;

  SubmissionRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
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
            where l.id = ?
            """)
        .params(labId)
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

  /**
   * Inserts the submission unless the student already used the key. A concurrent insert with the
   * same key waits for the first one to finish and then inserts nothing.
   *
   * @return true if a row was inserted
   */
  boolean insertIfAbsent(Stored submission, String key) {
    return jdbc.sql(
                """
                insert into submissions
                  (id, lab_id, student_id, idempotency_key, code, size_bytes, submitted_at)
                values (?, ?, ?, ?, ?, ?, ?)
                on conflict (student_id, idempotency_key) do nothing
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
