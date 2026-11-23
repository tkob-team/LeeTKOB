package com.leetkob.backend.judge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.leetkob.backend.BackendApplication;
import com.leetkob.backend.TestcontainersConfiguration;
import com.leetkob.backend.judge.JudgeQueue.Result;
import com.leetkob.backend.judge.JudgeQueue.TestResult;
import com.leetkob.backend.judge.JudgeQueue.Verdict;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.json.JsonMapper;

/** The real worker process can be stopped independently of submission intake. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIfEnvironmentVariable(named = "JUDGE_SANDBOX_TESTS", matches = "1")
class JudgeWorkerRestartTest {

  @Autowired private JdbcClient jdbc;
  @Autowired private JsonMapper json;
  @Autowired private MockMvc mvc;
  @Autowired private PostgreSQLContainer postgres;
  @TempDir private Path temp;

  @Test
  void stopSubmitAndRestartPersistsOneOrderedVerdictAndOneCheckJob() throws Exception {
    UUID student = UUID.randomUUID();
    UUID classId = UUID.randomUUID();
    UUID lab = UUID.randomUUID();
    jdbc.sql("truncate submissions, labs, class_members, classes, users cascade").update();
    jdbc.sql("insert into users (id) values (?)").param(student).update();
    jdbc.sql("insert into classes (id, name) values (?, 'Worker restart fixture')")
        .param(classId)
        .update();
    jdbc.sql("insert into class_members (class_id, user_id) values (?, ?)")
        .params(classId, student)
        .update();
    jdbc.sql(
            """
            insert into labs (id, class_id, opens_at, due_at, cpu_time_ms, memory_mb)
            values (?, ?, now() - interval '1 day', now() + interval '1 day', 1200, 64)
            """)
        .params(lab, classId)
        .update();
    jdbc.sql("insert into lab_tests values (?, 2, '20', '40'), (?, 1, '3', '6')")
        .params(lab, lab)
        .update();

    withWorker("before", () -> {});
    String body =
        json.writeValueAsString(
            Map.of(
                "code",
                "#include <iostream>\nint main() { int x; std::cin >> x; std::cout << 2*x; }"));
    var receipt =
        mvc.perform(
                post("/labs/{lab}/submissions", lab)
                    .with(
                        jwt()
                            .jwt(token ->
                                token.subject(student.toString()).claim("role", "STUDENT")))
                    .contentType("application/json")
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .content(body))
            .andExpect(status().isCreated())
            .andReturn();
    UUID id =
        UUID.fromString(
            json.readTree(receipt.getResponse().getContentAsString()).get("id").asString());
    assertThat(result(id)).isEmpty();
    assertThat(checkJobCount(id)).isZero();

    withWorker("after", () -> await(() -> result(id).isPresent(), "pending judge job to finish"));
    assertThat(result(id))
        .contains(
            new Result(
                Verdict.AC, List.of(new TestResult(1, Verdict.AC), new TestResult(2, Verdict.AC))));
    assertThat(checkJobCount(id)).isEqualTo(1);
    String finished = finishTime(id);

    withWorker("repeat", () -> Thread.sleep(600));
    assertThat(finishTime(id)).isEqualTo(finished);
    assertThat(checkJobCount(id)).isEqualTo(1);
  }

  private void withWorker(String attempt, CheckedAction action) throws Exception {
    Path log = temp.resolve(attempt + ".log");
    String classpath = System.getProperty("java.class.path").replace("\\", "\\\\");
    Path argfile =
        Files.writeString(
            temp.resolve(attempt + ".args"),
            "-cp\n\""
                + classpath
                + "\"\n"
                + BackendApplication.class.getName()
                + "\njudge-worker\n");
    var launch =
        new ProcessBuilder(ProcessHandle.current().info().command().orElseThrow(), "@" + argfile);
    launch.environment().put("DB_URL", postgres.getJdbcUrl());
    launch.environment().put("DB_USER", postgres.getUsername());
    launch.environment().put("DB_PASSWORD", postgres.getPassword());
    launch.redirectErrorStream(true).redirectOutput(log.toFile());
    Process process = launch.start();
    try {
      await(() -> !process.isAlive() || workerReady(log), "worker readiness");
      assertThat(process.isAlive()).as(Files.readString(log)).isTrue();
      action.run();
    } finally {
      process.destroy();
      if (!process.waitFor(10, TimeUnit.SECONDS)) {
        process.destroyForcibly().waitFor();
      }
    }
  }

  private static boolean workerReady(Path log) {
    try {
      return Files.readString(log).contains("event=judge_worker_started");
    } catch (java.io.IOException e) {
      throw new java.io.UncheckedIOException(e);
    }
  }

  private Optional<Result> result(UUID id) {
    return jdbc.sql(
            "select result::text from judge_jobs where submission_id = ? and result is not null")
        .param(id)
        .query((row, number) -> json.readValue(row.getString(1), Result.class))
        .optional();
  }

  private String finishTime(UUID id) {
    return jdbc.sql("select finished_at::text from judge_jobs where submission_id = ?")
        .param(id)
        .query(String.class)
        .single();
  }

  private int checkJobCount(UUID id) {
    return jdbc.sql("select count(*) from check_jobs where submission_id = ?")
        .param(id)
        .query(Integer.class)
        .single();
  }

  private static void await(BooleanSupplier condition, String expected)
      throws InterruptedException {
    long deadline = System.nanoTime() + Duration.ofSeconds(45).toNanos();
    while (!condition.getAsBoolean() && System.nanoTime() < deadline) {
      Thread.sleep(100);
    }
    assertThat(condition.getAsBoolean()).as(expected).isTrue();
  }

  @FunctionalInterface
  private interface CheckedAction {
    void run() throws Exception;
  }
}
