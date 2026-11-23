package com.leetkob.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

/** The attempt window of docs/contract/post-auth-login.md section 3, with a movable clock. */
class LoginAttemptsTest {

  private static final class MovableClock extends Clock {
    private Instant now = Instant.parse("2026-11-23T08:00:00Z");

    void advance(Duration duration) {
      now = now.plus(duration);
    }

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now;
    }
  }

  @Test
  void emailIsBlockedAfterFiveFailuresUntilTheWindowEnds() {
    MovableClock clock = new MovableClock();
    LoginAttempts attempts = new LoginAttempts(clock);
    for (int i = 0; i < 5; i++) {
      assertThat(attempts.retryAfter("a@b", "10.0.0." + i)).isEmpty();
      attempts.failed("a@b", "10.0.0." + i);
      clock.advance(Duration.ofMinutes(1));
    }
    assertThat(attempts.retryAfter("a@b", "10.0.0.9")).contains(Duration.ofMinutes(10));
    clock.advance(Duration.ofMinutes(4));
    assertThat(attempts.retryAfter("a@b", "10.0.0.9")).contains(Duration.ofMinutes(6));
    clock.advance(Duration.ofMinutes(6));
    assertThat(attempts.retryAfter("a@b", "10.0.0.9")).isEmpty();
  }

  @Test
  void addressIsBlockedAfterTwentyFailures() {
    LoginAttempts attempts = new LoginAttempts(new MovableClock());
    for (int i = 0; i < 20; i++) {
      attempts.failed("user" + i + "@b", "10.0.0.1");
    }
    assertThat(attempts.retryAfter("other@b", "10.0.0.1")).contains(Duration.ofMinutes(15));
    assertThat(attempts.retryAfter("other@b", "10.0.0.2")).isEmpty();
  }

  @Test
  void successClearsTheEmailButNotTheAddress() {
    LoginAttempts attempts = new LoginAttempts(new MovableClock());
    for (int i = 0; i < 4; i++) {
      attempts.failed("a@b", "10.0.0.1");
    }
    attempts.succeeded("a@b");
    attempts.failed("a@b", "10.0.0.1");
    assertThat(attempts.retryAfter("a@b", "10.0.0.2")).isEmpty();
    for (int i = 0; i < 15; i++) {
      attempts.failed("x" + i + "@b", "10.0.0.1");
    }
    assertThat(attempts.retryAfter("a@b", "10.0.0.1")).isPresent();
  }
}
