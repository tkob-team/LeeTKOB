package com.leetkob.backend.judge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.leetkob.backend.judge.JudgeQueue.Result;
import com.leetkob.backend.judge.JudgeQueue.TestResult;
import com.leetkob.backend.judge.JudgeQueue.Verdict;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Verdict aggregation contract for an ordered test run. */
class JudgeResultTest {

  @Test
  void rejectsOverallVerdictAbsentFromTests() {
    var tests = List.of(new TestResult(1, Verdict.TLE));
    assertThatThrownBy(() -> new Result(Verdict.WA, tests))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void usesFirstFailedTestInTestOrder() {
    var tests =
        List.of(
            new TestResult(1, Verdict.AC),
            new TestResult(2, Verdict.TLE),
            new TestResult(3, Verdict.WA));

    assertThat(new Result(Verdict.TLE, tests).verdict()).isEqualTo(Verdict.TLE);
    assertThatThrownBy(() -> new Result(Verdict.WA, tests))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
