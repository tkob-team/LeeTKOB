package com.leetkob.backend.judge;

import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Worker loop step. The injected judge owns compilation and execution. */
public final class JudgeWorker {

  private static final Logger LOG = LoggerFactory.getLogger(JudgeWorker.class);

  /** Grading adapter. Exceptions leave the job available for retry after lease expiry. */
  @FunctionalInterface
  public interface Judge {
    /** Run the configured tests for the claimed submission. */
    JudgeQueue.Result grade(JudgeQueue.Claim claim);
  }

  /** Observable outcome of a single poll. */
  public enum Outcome {
    IDLE,
    COMPLETED,
    CLAIM_LOST
  }

  private final JudgeQueue queue;
  private final Judge judge;
  private final Duration lease;

  /** Create a worker with its queue, grading adapter and claim duration. */
  public JudgeWorker(JudgeQueue queue, Judge judge, Duration lease) {
    this.queue = queue;
    this.judge = judge;
    this.lease = lease;
  }

  /** Claim and grade one job. Call from a worker process outside a database transaction. */
  public Outcome runOne() {
    var next = queue.claim(lease);
    if (next.isEmpty()) {
      return Outcome.IDLE;
    }
    var claim = next.get();
    long start = System.nanoTime();
    var result = judge.grade(claim);
    long gradingMillis = Duration.ofNanos(System.nanoTime() - start).toMillis();
    boolean saved = queue.complete(claim, result);
    Outcome outcome = saved ? Outcome.COMPLETED : Outcome.CLAIM_LOST;
    LOG.info(
        "event=judge_worker_finished submissionId={} outcome={} gradingMillis={}",
        claim.submissionId(),
        outcome,
        gradingMillis);
    return outcome;
  }
}
