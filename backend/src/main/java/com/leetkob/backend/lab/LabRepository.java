package com.leetkob.backend.lab;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** SQL for lab authoring; the only writer of labs, lab_tests and lab_constraints. */
@Repository
class LabRepository {

  /** A lab row; {@code title} is null for labs created before PA#03. */
  record Lab(
      UUID id,
      UUID classId,
      String title,
      String statementMd,
      Instant opensAt,
      Instant dueAt,
      int cpuTimeMs,
      int memoryMb) {}

  /** One row of the class lab list. */
  record Summary(
      UUID id,
      String title,
      Instant opensAt,
      Instant dueAt,
      int cpuTimeMs,
      int memoryMb,
      int testCount,
      int constraintCount,
      int submissionCount,
      int studentsSubmitted) {}

  /** A stored test case. */
  record TestRow(int ordinal, String input, String expectedOutput) {}

  /** A stored constraint. */
  record ConstraintRow(String code, String text, BigDecimal deduction) {}

  private final JdbcClient jdbc;

  LabRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  Optional<String> role(UUID userId) {
    return jdbc.sql("select role from users where id = ?")
        .param(userId)
        .query(String.class)
        .optional();
  }

  boolean isTaOf(UUID classId, UUID userId) {
    return jdbc.sql("select exists (select 1 from class_tas where class_id = ? and user_id = ?)")
        .params(classId, userId)
        .query(Boolean.class)
        .single();
  }

  boolean isMemberOf(UUID classId, UUID userId) {
    return jdbc.sql(
            "select exists (select 1 from class_members where class_id = ? and user_id = ?)")
        .params(classId, userId)
        .query(Boolean.class)
        .single();
  }

  @Transactional
  UUID insert(UUID classId, LabRequestParser.NewLab lab) {
    UUID id = UUID.randomUUID();
    jdbc.sql(
            """
            insert into labs
              (id, class_id, title, statement_md, opens_at, due_at, cpu_time_ms, memory_mb)
            values (?, ?, ?, ?, ?, ?, ?, ?)
            """)
        .params(
            id,
            classId,
            lab.title(),
            lab.statementMd(),
            Timestamp.from(lab.opensAt()),
            Timestamp.from(lab.dueAt()),
            lab.cpuTimeMs(),
            lab.memoryMb())
        .update();
    for (int i = 0; i < lab.tests().size(); i++) {
      LabRequestParser.TestCase test = lab.tests().get(i);
      jdbc.sql(
              "insert into lab_tests (lab_id, ordinal, input, expected_output) values (?, ?, ?, ?)")
          .params(id, i + 1, test.input(), test.expectedOutput())
          .update();
    }
    for (int i = 0; i < lab.constraints().size(); i++) {
      LabRequestParser.Constraint constraint = lab.constraints().get(i);
      jdbc.sql(
              """
              insert into lab_constraints (lab_id, code, ordinal, text, deduction)
              values (?, ?, ?, ?, ?)
              """)
          .params(id, constraint.code(), i + 1, constraint.text(), constraint.deduction())
          .update();
    }
    return id;
  }

  Optional<Lab> find(UUID labId) {
    return jdbc.sql(
            """
            select id, class_id, title, statement_md, opens_at, due_at, cpu_time_ms, memory_mb
            from labs where id = ?
            """)
        .param(labId)
        .query((rs, n) ->
            new Lab(
                rs.getObject("id", UUID.class),
                rs.getObject("class_id", UUID.class),
                rs.getString("title"),
                rs.getString("statement_md"),
                rs.getTimestamp("opens_at").toInstant(),
                rs.getTimestamp("due_at").toInstant(),
                rs.getInt("cpu_time_ms"),
                rs.getInt("memory_mb")))
        .optional();
  }

  List<Summary> list(UUID classId) {
    return jdbc.sql(
            """
            select l.id, l.title, l.opens_at, l.due_at, l.cpu_time_ms, l.memory_mb,
              (select count(*) from lab_tests t where t.lab_id = l.id) as test_count,
              (select count(*) from lab_constraints c where c.lab_id = l.id) as constraint_count,
              (select count(*) from submissions s where s.lab_id = l.id) as submission_count,
              (select count(distinct s.student_id) from submissions s where s.lab_id = l.id)
                as students_submitted
            from labs l
            where l.class_id = ?
            order by l.opens_at desc, l.id
            """)
        .param(classId)
        .query((rs, n) ->
            new Summary(
                rs.getObject("id", UUID.class),
                rs.getString("title"),
                rs.getTimestamp("opens_at").toInstant(),
                rs.getTimestamp("due_at").toInstant(),
                rs.getInt("cpu_time_ms"),
                rs.getInt("memory_mb"),
                rs.getInt("test_count"),
                rs.getInt("constraint_count"),
                rs.getInt("submission_count"),
                rs.getInt("students_submitted")))
        .list();
  }

  List<TestRow> tests(UUID labId) {
    return jdbc.sql(
            "select ordinal, input, expected_output from lab_tests where lab_id = ? order by"
                + " ordinal")
        .param(labId)
        .query(TestRow.class)
        .list();
  }

  List<ConstraintRow> constraints(UUID labId) {
    return jdbc.sql(
            "select code, text, deduction from lab_constraints where lab_id = ? order by ordinal")
        .param(labId)
        .query(ConstraintRow.class)
        .list();
  }
}
