package com.leetkob.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

/** V4 applies on PostgreSQL and its check constraints reject invalid PA#3 rows. */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class Pa3BoundariesMigrationTest {

  @Autowired private JdbcClient jdbc;

  private UUID lab;
  private UUID submission;

  @BeforeEach
  void seed() {
    jdbc.sql("truncate submissions, labs, class_members, classes, users cascade").update();
    UUID student = UUID.randomUUID();
    lab = UUID.randomUUID();
    submission = UUID.randomUUID();
    jdbc.sql("insert into users (id) values (?)").param(student).update();
    UUID classId = UUID.randomUUID();
    jdbc.sql("insert into classes (id, name) values (?, 'Boundary test')").param(classId).update();
    jdbc.sql(
            """
            insert into labs (id, class_id, opens_at, due_at)
            values (?, ?, now() - interval '1 day', now() + interval '1 day')
            """)
        .params(lab, classId)
        .update();
    jdbc.sql(
            """
            insert into submissions (id, lab_id, student_id, idempotency_key, code, size_bytes,
                                     submitted_at)
            values (?, ?, ?, ?, 'int main() {}', 13, now())
            """)
        .params(submission, lab, student, submission.toString())
        .update();
  }

  @Test
  void v4IsAppliedAndLabDefaultsMatchTheSpec() {
    assertThat(
            jdbc.sql("select success from flyway_schema_history where version = '4'")
                .query(Boolean.class)
                .single())
        .isTrue();
    assertThat(
            jdbc.sql("select cpu_time_ms || '/' || memory_mb || '/' || statement_md from labs")
                .query(String.class)
                .single())
        .isEqualTo("1000/256/");
  }

  @Test
  void acceptsValidRowsInEveryNewTable() {
    jdbc.sql("insert into lab_tests values (?, 1, '1 2', '3')").param(lab).update();
    jdbc.sql("insert into lab_constraints values (?, 'C1', 1, 'No STL sort', 0.25)")
        .param(lab)
        .update();
    jdbc.sql("insert into check_jobs (submission_id, enqueued_at) values (?, now())")
        .param(submission)
        .update();
    UUID call = UUID.randomUUID();
    jdbc.sql(
            """
            insert into model_calls (id, submission_id, model, latency_ms, outcome)
            values (?, ?, 'fake-model', 12, 'ok')
            """)
        .params(call, submission)
        .update();
    jdbc.sql(
            """
            insert into findings (submission_id, constraint_code, verdict, source, evidence,
                                  model_call_id)
            values (?, 'C1', 'violation', 'model', '[{"line": 3, "text": "sort(a, a + n);"}]', ?)
            """)
        .params(submission, call)
        .update();

    assertThat(jdbc.sql("select count(*) from findings").query(Integer.class).single())
        .isEqualTo(1);
  }

  @Test
  void rejectsUnknownFindingVerdict() {
    assertThatThrownBy(() ->
            jdbc.sql(
                    """
                    insert into findings (submission_id, constraint_code, verdict, source)
                    values (?, 'C1', 'maybe', 'model')
                    """)
                .param(submission)
                .update())
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void rejectsZeroDeduction() {
    assertThatThrownBy(() ->
            jdbc.sql("insert into lab_constraints values (?, 'C1', 1, 'Rule', 0)")
                .param(lab)
                .update())
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void rejectsLabLimitsOutsideTheAllowedRange() {
    assertThatThrownBy(
            () -> jdbc.sql("update labs set cpu_time_ms = 999 where id = ?").param(lab).update())
        .isInstanceOf(DataIntegrityViolationException.class);
    assertThatThrownBy(
            () -> jdbc.sql("update labs set memory_mb = 513 where id = ?").param(lab).update())
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void rejectsCheckJobLeaseWithoutExpiry() {
    assertThatThrownBy(() ->
            jdbc.sql(
                    """
                    insert into check_jobs (submission_id, enqueued_at, lease_token)
                    values (?, now(), gen_random_uuid())
                    """)
                .param(submission)
                .update())
        .isInstanceOf(DataIntegrityViolationException.class);
  }
}
