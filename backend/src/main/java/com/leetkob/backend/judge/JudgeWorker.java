package com.leetkob.backend.judge;

import java.time.Duration;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

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
    try (var attempt = MDC.putCloseable("attempt_id", UUID.randomUUID().toString())) {
      return runClaim(claim, start);
    }
  }

  private Outcome runClaim(JudgeQueue.Claim claim, long start) {
    LOG.atInfo()
        .addKeyValue("event", "judge_claimed")
        .addKeyValue("submission_id", claim.submissionId())
        .log("Judge claimed submission");
    try {
      return gradeClaim(claim, start);
    } catch (RuntimeException error) {
      try {
        queue.recordInfrastructureFailure(claim);
      } catch (RuntimeException telemetryError) {
        error.addSuppressed(telemetryError);
      }
      LOG.atWarn()
          .addKeyValue("event", "judge_retry_pending")
          .addKeyValue("submission_id", claim.submissionId())
          .addKeyValue("error_type", error.getClass().getSimpleName())
          .log("Judge left submission for lease recovery");
      throw error;
    }
  }

  private Outcome gradeClaim(JudgeQueue.Claim claim, long start) {
    var result = judge.grade(claim);
    long gradingMillis = Duration.ofNanos(System.nanoTime() - start).toMillis();
    boolean saved = queue.complete(claim, result, gradingMillis);
    Outcome outcome = saved ? Outcome.COMPLETED : Outcome.CLAIM_LOST;
    LOG.info(
        "event=judge_worker_finished submissionId={} outcome={} gradingMillis={}",
        claim.submissionId(),
        outcome,
        gradingMillis);
    LOG.atInfo()
        .addKeyValue("event", saved ? "judge_verdict_saved" : "judge_claim_lost")
        .addKeyValue("submission_id", claim.submissionId())
        .addKeyValue("verdict", result.verdict())
        .addKeyValue("grading_ms", gradingMillis)
        .addKeyValue("checker_queued", saved && result.verdict() == JudgeQueue.Verdict.AC)
        .log("Judge finished submission");
    return outcome;
  }
}
