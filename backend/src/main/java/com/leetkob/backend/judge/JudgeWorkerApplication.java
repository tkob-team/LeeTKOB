package com.leetkob.backend.judge;

import java.time.Duration;
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
        .run(args);
  }

  @Bean
  PollingWorker pollingWorker(
      JudgeQueue queue,
      JdbcClient jdbc,
      @Value("${JUDGE_SANDBOX_IMAGE:" + DockerSandbox.DEFAULT_IMAGE + "}") String image) {
    var judge = new DockerJudge(jdbc, queue, new DockerSandbox(image), LEASE);
    return new PollingWorker(new JudgeWorker(queue, judge, LEASE));
  }

  static final class PollingWorker {

    private final JudgeWorker worker;

    PollingWorker(JudgeWorker worker) {
      this.worker = worker;
    }

    @EventListener(ApplicationReadyEvent.class)
    void ready() {
      LOG.info("event=judge_worker_started");
    }

    @Scheduled(fixedDelay = 250)
    void poll() {
      try {
        worker.runOne();
      } catch (RuntimeException e) {
        // Leave the lease for recovery. Do not log any untrusted source, output or diagnostics.
        LOG.warn("event=judge_worker_retry errorType={}", e.getClass().getSimpleName());
      }
    }
  }
}
