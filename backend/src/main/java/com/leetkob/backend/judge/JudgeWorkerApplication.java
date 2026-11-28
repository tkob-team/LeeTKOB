package com.leetkob.backend.judge;

import java.time.Duration;
import java.util.function.BooleanSupplier;
import java.util.function.LongSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** Standalone process configuration. The normal HTTP application does not import it. */
@EnableAutoConfiguration
@EnableScheduling
@Import(PostgresJudgeQueue.class)
public class JudgeWorkerApplication {

  private static final Logger LOG = LoggerFactory.getLogger(JudgeWorkerApplication.class);
  private static final Duration LEASE = Duration.ofSeconds(60);

  /** Starts the non-HTTP worker using the same packaged application and database configuration. */
  public static void start(String... args) {
    new SpringApplicationBuilder(JudgeWorkerApplication.class)
        .web(WebApplicationType.NONE)
        .properties("logging.structured.json.add.service=judge-worker")
        .run(args);
  }

  @Bean
  PollingWorker pollingWorker(
      JudgeQueue queue,
      JdbcClient jdbc,
      @Value("${JUDGE_SANDBOX_IMAGE:" + DockerSandbox.DEFAULT_IMAGE + "}") String image) {
    var sandbox = new DockerSandbox(image);
    var judge = new DockerJudge(jdbc, queue, sandbox, LEASE);
    return new PollingWorker(
        new JudgeWorker(queue, judge, LEASE), sandbox::isReady, System::nanoTime);
  }

  static final class PollingWorker {

    private static final long HEALTHY_NANOS = Duration.ofSeconds(2).toNanos();
    private static final long RETRY_NANOS = Duration.ofSeconds(5).toNanos();

    private final JudgeWorker worker;
    private final BooleanSupplier sandboxReady;
    private final LongSupplier clock;
    private boolean available;
    private long nextProbe;

    PollingWorker(JudgeWorker worker, BooleanSupplier sandboxReady, LongSupplier clock) {
      this.worker = worker;
      this.sandboxReady = sandboxReady;
      this.clock = clock;
      nextProbe = clock.getAsLong();
    }

    @EventListener(ApplicationReadyEvent.class)
    void ready() {
      LOG.info("event=judge_worker_started");
    }

    @Scheduled(fixedDelay = 250)
    void poll() {
      if (clock.getAsLong() - nextProbe >= 0) {
        available = sandboxReady.getAsBoolean();
        nextProbe = clock.getAsLong() + (available ? HEALTHY_NANOS : RETRY_NANOS);
        if (!available) {
          LOG.warn("event=judge_sandbox_unavailable");
        }
      }
      if (!available) {
        return;
      }
      try {
        worker.runOne();
      } catch (RuntimeException e) {
        available = false;
        nextProbe = clock.getAsLong() + RETRY_NANOS;
        // Leave the lease for recovery. Do not log any untrusted source, output or diagnostics.
        LOG.warn("event=judge_worker_retry errorType={}", e.getClass().getSimpleName());
      }
    }
  }
}
