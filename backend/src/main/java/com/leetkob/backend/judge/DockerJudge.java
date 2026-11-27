package com.leetkob.backend.judge;

import com.leetkob.backend.judge.JudgeQueue.Claim;
import com.leetkob.backend.judge.JudgeQueue.Result;
import com.leetkob.backend.judge.JudgeQueue.TestResult;
import com.leetkob.backend.judge.JudgeQueue.Verdict;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Reads the lab configuration and grades one claimed job with the Docker sandbox. */
final class DockerJudge implements JudgeWorker.Judge {

  private static final Logger LOG = LoggerFactory.getLogger(DockerJudge.class);
  private static final Pattern SEPARATOR = Pattern.compile("\\s+");

  private record LabTest(String input, String expected, int cpuMs, int memoryMb) {}

  private final JdbcClient jdbc;
  private final JudgeQueue queue;
  private final DockerSandbox sandbox;
  private final Duration lease;

  DockerJudge(JdbcClient jdbc, JudgeQueue queue, DockerSandbox sandbox, Duration lease) {
    this.jdbc = jdbc;
    this.queue = queue;
    this.sandbox = sandbox;
    this.lease = lease;
  }

  @Override
  public Result grade(Claim claim) {
    var tests =
        jdbc.sql(
                """
                select t.input, t.expected_output, l.cpu_time_ms, l.memory_mb
                from lab_tests t join labs l on l.id = t.lab_id
                where t.lab_id = ?
                order by t.ordinal
                """)
            .param(claim.labId())
            .query((row, number) ->
                new LabTest(
                    row.getString("input"),
                    row.getString("expected_output"),
                    row.getInt("cpu_time_ms"),
                    row.getInt("memory_mb")))
            .list();
    if (tests.isEmpty()) {
      throw new IllegalStateException("The lab has no grading tests.");
    }

    requireLease(claim);
    var compiled = sandbox.compile(claim.code());
    sandboxEvent(claim, 0, compiled.outcome());
    if (compiled.outcome() != DockerSandbox.Outcome.OK) {
      return new Result(Verdict.CE, List.of());
    }

    var results = new ArrayList<TestResult>();
    Verdict overall = Verdict.AC;
    for (var test : tests) {
      requireLease(claim);
      var execution = sandbox.run(compiled.stdout(), test.input(), test.cpuMs(), test.memoryMb());
      sandboxEvent(claim, results.size() + 1, execution.outcome());
      Verdict verdict =
          switch (execution.outcome()) {
            case OK -> compareOutput(execution.stdout(), test.expected()) ? Verdict.AC : Verdict.WA;
            case CPU, WALL -> Verdict.TLE;
            case MEMORY -> Verdict.MLE;
            case OUTPUT, PROGRAM_ERROR -> Verdict.RE;
          };
      results.add(new TestResult(results.size() + 1, verdict));
      if (overall == Verdict.AC) {
        overall = verdict;
      }
    }
    return new Result(overall, results);
  }

  private static void sandboxEvent(Claim claim, int test, DockerSandbox.Outcome outcome) {
    LOG.atInfo()
        .addKeyValue("event", test == 0 ? "sandbox_compile" : "sandbox_run")
        .addKeyValue("submission_id", claim.submissionId())
        .addKeyValue("test_number", test)
        .addKeyValue("outcome", outcome)
        .log("Sandbox phase finished");
  }

  private void requireLease(Claim claim) {
    if (!queue.renew(claim, lease)) {
      throw new IllegalStateException("Judge claim expired before starting a sandbox phase.");
    }
  }

  private static boolean compareOutput(byte[] actual, String expected) {
    String decoded = new String(actual, StandardCharsets.UTF_8);
    return SEPARATOR
        .matcher(decoded.strip())
        .replaceAll(" ")
        .equals(SEPARATOR.matcher(expected.strip()).replaceAll(" "));
  }
}
