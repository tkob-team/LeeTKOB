package com.leetkob.backend.judge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.leetkob.backend.TestcontainersConfiguration;
import com.leetkob.backend.judge.JudgeQueue.Result;
import com.leetkob.backend.judge.JudgeQueue.TestResult;
import com.leetkob.backend.judge.JudgeQueue.Verdict;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.json.JsonMapper;

/** PostgreSQL contract for work claims, recovery and result persistence. */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class JudgeQueueIntegrationTest {

  private static final Duration LEASE = Duration.ofMinutes(1);
  private static final String CODE = "int main() { return 0; }\n";
  private static final Result AC = new Result(Verdict.AC, List.of(new TestResult(1, Verdict.AC)));
  private static final Result WA = new Result(Verdict.WA, List.of(new TestResult(1, Verdict.WA)));

  @Autowired private JdbcClient jdbc;
  @Autowired private JudgeQueue queue;
  @Autowired private DataSource dataSource;
  @Autowired private JsonMapper json;

  private UUID student;
  private UUID lab;

  @BeforeEach
  void seed() {
    jdbc.sql("truncate submissions, labs, class_members, classes, users cascade").update();
    student = UUID.randomUUID();
    UUID classId = UUID.randomUUID();
    lab = UUID.randomUUID();
    jdbc.sql("insert into users (id) values (?)").param(student).update();
    jdbc.sql("insert into classes (id, name) values (?, 'Queue test')").param(classId).update();
    jdbc.sql(
            """
            insert into labs (id, class_id, opens_at, due_at)
            values (?, ?, now() - interval '1 day', now() + interval '1 day')
            """)
        .params(lab, classId)
        .update();
  }

  @Test
  void workerGradesOutsideTransactionAndPersistsOneOrderedResult() {
    UUID id = job(1);
    var verdict =
        new Result(
            Verdict.WA, List.of(new TestResult(1, Verdict.AC), new TestResult(2, Verdict.WA)));
    var worker =
        new JudgeWorker(
            queue,
            claim -> {
              assertThat(claim.submissionId()).isEqualTo(id);
              assertThat(claim.labId()).isEqualTo(lab);
              assertThat(claim.code()).isEqualTo(CODE);
              assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
              assertThat(queue.claim(LEASE)).isEmpty();
              return verdict;
            },
            LEASE);

    assertThat(worker.runOne()).isEqualTo(JudgeWorker.Outcome.COMPLETED);
    assertThat(worker.runOne()).isEqualTo(JudgeWorker.Outcome.IDLE);
    assertThat(json.readValue(readResult(id), Result.class)).isEqualTo(verdict);
  }

  @Test
  void lockedOldestJobDoesNotBlockClaimOfTheNextJob() throws Exception {
    UUID oldest = job(2);
    UUID next = job(1);
    try (var connection = dataSource.getConnection();
        var lock =
            connection.prepareStatement(
                "select submission_id from judge_jobs where submission_id = ? for update")) {
      connection.setAutoCommit(false);
      lock.setObject(1, oldest);
      try (var rows = lock.executeQuery()) {
        assertThat(rows.next()).isTrue();
      }
      var executor = Executors.newSingleThreadExecutor();
      try {
        var result = executor.submit(() -> queue.claim(LEASE));
        assertThat(result.get(5, TimeUnit.SECONDS).orElseThrow().submissionId()).isEqualTo(next);
      } finally {
        connection.rollback();
        executor.shutdownNow();
      }
    }
    assertThat(queue.claim(LEASE).orElseThrow().submissionId()).isEqualTo(oldest);
  }

  @Test
  void expiredWorkerCannotStoreOrReplaceResult() {
    UUID id = job(1);
    var stale = queue.claim(LEASE).orElseThrow();
    expire(id);

    assertThat(queue.complete(stale, WA)).isFalse();
    var current = queue.claim(LEASE).orElseThrow();
    assertThat(current.submissionId()).isEqualTo(id);
    assertThat(current.leaseToken()).isNotEqualTo(stale.leaseToken());
    assertThat(queue.complete(stale, WA)).isFalse();
    assertThat(queue.complete(current, AC)).isTrue();
    assertThat(queue.complete(current, WA)).isFalse();
    assertThat(queue.claim(LEASE)).isEmpty();
    assertThat(json.readValue(readResult(id), Result.class)).isEqualTo(AC);
  }

  @Test
  void rejectsCompletionWhenLeaseExpiresWhileWaitingForRowLock() throws Exception {
    final UUID id = job(1);
    var claim = queue.claim(Duration.ofSeconds(4)).orElseThrow();
    try (var connection = dataSource.getConnection();
        var lock =
            connection.prepareStatement(
                "select pg_backend_pid() from judge_jobs where submission_id = ? for update")) {
      connection.setAutoCommit(false);
      lock.setObject(1, id);
      int ownerPid;
      try (var rows = lock.executeQuery()) {
        assertThat(rows.next()).isTrue();
        ownerPid = rows.getInt(1);
      }
      var executor = Executors.newSingleThreadExecutor();
      try {
        final var completion = executor.submit(() -> queue.complete(claim, WA));
        awaitBlockedWriter(ownerPid);
        assertThat(
                jdbc.sql(
                        "select lease_expires_at > clock_timestamp() from judge_jobs "
                            + "where submission_id = ?")
                    .param(id)
                    .query(Boolean.class)
                    .single())
            .isTrue();
        jdbc.sql(
                """
                select pg_sleep_until(lease_expires_at) is null
                from judge_jobs
                where submission_id = ?
                """)
            .param(id)
            .query(Boolean.class)
            .single();
        connection.commit();
        assertThat(completion.get(5, TimeUnit.SECONDS)).isFalse();
      } finally {
        connection.rollback();
        executor.shutdownNow();
      }
    }
    assertThat(
            jdbc.sql("select result is null from judge_jobs where submission_id = ?")
                .param(id)
                .query(Boolean.class)
                .single())
        .isTrue();
    assertThat(queue.claim(LEASE).orElseThrow().submissionId()).isEqualTo(id);
  }

  private void awaitBlockedWriter(int ownerPid) throws InterruptedException {
    long deadline = System.nanoTime() + Duration.ofSeconds(3).toNanos();
    while (System.nanoTime() < deadline) {
      if (jdbc.sql(
              "select exists (select 1 from pg_stat_activity where ? = any(pg_blocking_pids(pid)))")
          .param(ownerPid)
          .query(Boolean.class)
          .single()) {
        return;
      }
      Thread.sleep(10);
    }
    throw new AssertionError("The result writer did not wait for the row lock.");
  }

  @Test
  void failedJudgeLeavesNoVerdictAndAllowsRecoveryAfterExpiry() {
    final UUID id = job(1);
    var worker =
        new JudgeWorker(
            queue,
            claim -> {
              throw new IllegalStateException("fake grader unavailable");
            },
            LEASE);

    assertThatThrownBy(worker::runOne).isInstanceOf(IllegalStateException.class);
    assertThat(queue.claim(LEASE)).isEmpty();
    assertThat(
            jdbc.sql("select count(*) from judge_jobs where result is not null")
                .query(Integer.class)
                .single())
        .isZero();

    expire(id);
    assertThat(new JudgeWorker(queue, claim -> AC, LEASE).runOne())
        .isEqualTo(JudgeWorker.Outcome.COMPLETED);
  }

  @Test
  void acceptedCompletionEnqueuesOneCheckJobAndWrongAnswerEnqueuesNone() {
    UUID accepted = job(2);
    UUID rejected = job(1);
    var first = queue.claim(LEASE).orElseThrow();
    var second = queue.claim(LEASE).orElseThrow();

    assertThat(queue.complete(first, AC)).isTrue();
    assertThat(queue.complete(first, AC)).isFalse();
    assertThat(queue.complete(second, WA)).isTrue();
    assertThat(jdbc.sql("select submission_id from check_jobs").query(UUID.class).list())
        .containsExactly(accepted);
    assertThat(
            jdbc.sql(
                    """
                    select c.enqueued_at = j.finished_at
                    from check_jobs c join judge_jobs j using (submission_id)
                    """)
                .query(Boolean.class)
                .single())
        .isTrue();
    assertThat(json.readValue(readResult(rejected), Result.class)).isEqualTo(WA);
  }

  @Test
  void failedCheckEnqueueRollsBackTheAcceptedVerdict() {
    UUID id = job(1);
    var claim = queue.claim(LEASE).orElseThrow();
    jdbc.sql("insert into check_jobs (submission_id, enqueued_at) values (?, now())")
        .param(id)
        .update();

    assertThatThrownBy(() -> queue.complete(claim, AC)).isInstanceOf(DuplicateKeyException.class);
    assertThat(
            jdbc.sql("select result is null from judge_jobs where submission_id = ?")
                .param(id)
                .query(Boolean.class)
                .single())
        .isTrue();
    assertThat(queue.complete(claim, WA)).isTrue();
  }

  private UUID job(int ageSeconds) {
    UUID submission = UUID.randomUUID();
    jdbc.sql(
            """
            with created as (
              insert into submissions (id, lab_id, student_id, idempotency_key, code, size_bytes,
                                       submitted_at)
              values (?, ?, ?, ?, ?, ?, now() - ? * interval '1 second')
              returning id, submitted_at
            )
            insert into judge_jobs (submission_id, enqueued_at)
            select id, submitted_at from created
            """)
        .params(submission, lab, student, submission.toString(), CODE, CODE.length(), ageSeconds)
        .update();
    return submission;
  }

  private void expire(UUID id) {
    jdbc.sql("update judge_jobs set lease_expires_at = now() where submission_id = ?")
        .param(id)
        .update();
  }

  private String readResult(UUID id) {
    return jdbc.sql("select result::text from judge_jobs where submission_id = ?")
        .param(id)
        .query(String.class)
        .single();
  }
}
