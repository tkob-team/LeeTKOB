package com.leetkob.backend.judge;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

/** The poller keeps jobs ready while the sandbox dependency cannot serve them. */
class JudgeWorkerReadinessTest {

  @Test
  void waitsForReadinessThenBacksOffAfterAnInfrastructureFailure() {
    var worker = mock(JudgeWorker.class);
    when(worker.runOne())
        .thenThrow(new IllegalStateException("fixture proxy lost"))
        .thenReturn(JudgeWorker.Outcome.COMPLETED);
    var clock = new AtomicLong();
    var ready = new AtomicBoolean();
    var poller = new JudgeWorkerApplication.PollingWorker(worker, ready::get, clock::get);

    poller.poll();
    ready.set(true);
    poller.poll();
    verifyNoInteractions(worker);

    clock.set(Duration.ofSeconds(5).toNanos());
    poller.poll();
    poller.poll();
    verify(worker).runOne();

    clock.set(Duration.ofSeconds(10).toNanos());
    poller.poll();
    verify(worker, times(2)).runOne();
  }
}
