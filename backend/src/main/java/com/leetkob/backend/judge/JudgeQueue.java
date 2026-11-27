package com.leetkob.backend.judge;

import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/** Database-backed work exchange between submission intake and a judge worker. */
public interface JudgeQueue {

  /** A job and the token that grants this worker a temporary claim. */
  record Claim(UUID submissionId, UUID labId, String code, UUID leaseToken) {}

  /** Terminal grading verdicts from the judge. */
  enum Verdict {
    AC,
    WA,
    TLE,
    MLE,
    RE,
    CE
  }

  /** Student-visible result for one test, with a one-based index. */
  record TestResult(int number, Verdict verdict) {
    public TestResult {
      if (number < 1 || verdict == Verdict.CE) {
        throw new IllegalArgumentException("A test requires a positive index and a run verdict.");
      }
      Objects.requireNonNull(verdict);
    }
  }

  /** Overall verdict and outcomes in test order. */
  record Result(Verdict verdict, List<TestResult> tests) {
    public Result {
      Objects.requireNonNull(verdict);
      tests = List.copyOf(tests);
      if ((verdict == Verdict.CE) != tests.isEmpty()) {
        throw new IllegalArgumentException("Only compilation errors have no test results.");
      }
      for (int index = 0; index < tests.size(); index++) {
        if (tests.get(index).number() != index + 1) {
          throw new IllegalArgumentException("Tests must appear in consecutive one-based order.");
        }
      }
      if (verdict != Verdict.CE) {
        Verdict expected =
            tests.stream()
                .map(TestResult::verdict)
                .filter(testVerdict -> testVerdict != Verdict.AC)
                .findFirst()
                .orElse(Verdict.AC);
        if (verdict != expected) {
          throw new IllegalArgumentException(
              "Overall verdict must match the ordered test results.");
        }
      }
    }
  }

  /** Claim one job for at least one millisecond, with no transaction held during grading. */
  Optional<Claim> claim(Duration lease);

  /** Renew only a current, unexpired claim before starting another bounded sandbox phase. */
  boolean renew(Claim claim, Duration lease);

  /** Store a terminal result once. Return false if the claim has expired or was replaced. */
  boolean complete(Claim claim, Result result);

  /** Store a terminal result and measured grading time together when supported. */
  default boolean complete(Claim claim, Result result, long gradingMillis) {
    return complete(claim, result);
  }

  /** Record an infrastructure failure for operational metrics when supported. */
  default void recordInfrastructureFailure(Claim claim) {}
}
