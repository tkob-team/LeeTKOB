package com.leetkob.backend.submission;

import com.leetkob.backend.problem.ApiException;
import com.leetkob.backend.problem.ProblemType;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Bounded, authenticated stream of the same snapshots exposed by the status endpoint. */
@Component
class SubmissionEvents {

  private static final Duration STREAM_TIME = Duration.ofSeconds(20);
  private final Semaphore slots = new Semaphore(64);
  private final SubmissionRepository repository;

  SubmissionEvents(SubmissionRepository repository) {
    this.repository = repository;
  }

  SseEmitter open(
      UUID lab,
      UUID submission,
      UUID student,
      SubmissionRepository.Status initial,
      Instant expiry) {
    if (!slots.tryAcquire()) {
      throw new ApiException(ProblemType.SUBMISSION_STREAM_BUSY, "Retry the submission stream.");
    }
    var emitter = new SseEmitter(STREAM_TIME.plusSeconds(5).toMillis());
    var closed = new AtomicBoolean();
    emitter.onCompletion(() -> closed.set(true));
    emitter.onError(error -> closed.set(true));
    emitter.onTimeout(() -> closed.set(true));
    var timeLimit = Instant.now().plus(STREAM_TIME);
    var deadline = expiry.isBefore(timeLimit) ? expiry : timeLimit;
    Thread.startVirtualThread(() -> {
      try {
        var current = initial;
        if (Instant.now().isBefore(deadline)) {
          send(emitter, current);
        }
        while (!closed.get()
            && !"completed".equals(current.status())
            && Instant.now().isBefore(deadline)) {
          Thread.sleep(Duration.ofSeconds(1));
          if (closed.get() || !Instant.now().isBefore(deadline)) {
            break;
          }
          var next = repository.status(lab, submission, student);
          if (closed.get() || !Instant.now().isBefore(deadline) || next.isEmpty()) {
            break;
          }
          if (!current.equals(next.get())) {
            current = next.get();
            send(emitter, current);
          } else {
            emitter.send(SseEmitter.event().comment("keepalive"));
          }
        }
        emitter.complete();
      } catch (IOException | RuntimeException e) {
        emitter.completeWithError(e);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        emitter.complete();
      } finally {
        slots.release();
      }
    });
    return emitter;
  }

  private static void send(SseEmitter emitter, SubmissionRepository.Status status)
      throws IOException {
    emitter.send(SseEmitter.event().name("status").data(status, MediaType.APPLICATION_JSON));
  }
}
