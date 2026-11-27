package com.leetkob.backend.review;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** SQL for the TA review queue: counted submissions (FAQ-02) with their findings. */
@Repository
class ReviewQueueRepository {

  /** A lab the TA may review. */
  record Lab(UUID id, boolean provisional) {}

  /**
   * One (submission, constraint) row; constraint fields are null without constraints. {@code
   * counted} is false for an earlier AC submission of the same student.
   */
  record Row(
      UUID submissionId,
      boolean counted,
      UUID studentId,
      String displayName,
      Instant submittedAt,
      String judgeStatus,
      String verdict,
      String code,
      String text,
      BigDecimal deduction,
      String findingVerdict,
      String source,
      String evidence,
      String reason,
      String unsureCause) {}

  /**
   * Counted submissions of current class members: the latest one before the deadline (FAQ-02). With
   * {@code :earlier}, also every other AC submission of the same student before the deadline,
   * marked {@code counted = false}.
   */
  private static final String COUNTED =
      """
      with eligible as (
        select s.id, s.student_id, s.submitted_at,
          row_number() over (
            partition by s.student_id order by s.submitted_at desc, s.id desc) = 1 as counted
        from submissions s
        join labs l on l.id = s.lab_id
        join class_members m on m.class_id = l.class_id and m.user_id = s.student_id
        where s.lab_id = :lab and s.submitted_at < l.due_at
      ),
      counted as (
        select e.* from eligible e
        where e.counted or (cast(:earlier as boolean) and exists (
          select 1 from judge_jobs j
          where j.submission_id = e.id and j.result ->> 'verdict' = 'AC'))
      ),
      ranked as (
        select c.*, exists (
          select 1 from findings f
          join lab_constraints lc on lc.lab_id = :lab and lc.code = f.constraint_code
          where f.submission_id = c.id and f.verdict in ('violation', 'unsure')
        ) as needs_review
        from counted c
      )
      """;

  /** One page of submissions joined with every constraint and its finding. */
  private static final String PAGE =
      """
      , paged as (
        select * from ranked
        order by counted desc, needs_review desc, submitted_at, id
        limit :size offset :offset
      )
      select p.id, p.counted, p.student_id, u.display_name, p.submitted_at,
        case when j.finished_at is not null then 'completed'
             when j.lease_expires_at > statement_timestamp() then 'grading'
             else 'queued' end as judge_status,
        j.result ->> 'verdict' as verdict,
        lc.code, lc.text, lc.deduction,
        f.verdict as finding_verdict, f.source, f.evidence::text as evidence,
        f.reason, f.unsure_cause
      from paged p
      join users u on u.id = p.student_id
      left join judge_jobs j on j.submission_id = p.id
      left join lab_constraints lc on lc.lab_id = :lab
      left join findings f on f.submission_id = p.id and f.constraint_code = lc.code
      order by p.counted desc, p.needs_review desc, p.submitted_at, p.id, lc.ordinal, lc.code
      """;

  private final JdbcClient jdbc;

  ReviewQueueRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  Optional<String> role(UUID userId) {
    return jdbc.sql("select role from users where id = ?")
        .param(userId)
        .query(String.class)
        .optional();
  }

  Optional<Lab> labForTa(UUID labId, UUID taId) {
    return jdbc.sql(
            """
            select l.id, statement_timestamp() < l.due_at as provisional
            from labs l
            join class_tas t on t.class_id = l.class_id
            where l.id = ? and t.user_id = ?
            """)
        .params(labId, taId)
        .query((rs, row) -> new Lab(rs.getObject("id", UUID.class), rs.getBoolean("provisional")))
        .optional();
  }

  long count(UUID labId, boolean earlier) {
    return jdbc.sql(COUNTED + "select count(*) from ranked")
        .param("lab", labId)
        .param("earlier", earlier)
        .query(Long.class)
        .single();
  }

  List<Row> page(UUID labId, boolean earlier, int page, int size) {
    return jdbc.sql(COUNTED + PAGE)
        .param("lab", labId)
        .param("earlier", earlier)
        .param("size", size)
        .param("offset", (long) page * size)
        .query((rs, row) ->
            new Row(
                rs.getObject("id", UUID.class),
                rs.getBoolean("counted"),
                rs.getObject("student_id", UUID.class),
                rs.getString("display_name"),
                rs.getTimestamp("submitted_at").toInstant(),
                rs.getString("judge_status"),
                rs.getString("verdict"),
                rs.getString("code"),
                rs.getString("text"),
                rs.getBigDecimal("deduction"),
                rs.getString("finding_verdict"),
                rs.getString("source"),
                rs.getString("evidence"),
                rs.getString("reason"),
                rs.getString("unsure_cause")))
        .list();
  }
}
