package com.leetkob.backend.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * In-memory failed sign-in counter per email and per client address
 * (docs/contract/post-auth-login.md section 3). A window starts at the first counted failure and
 * lasts 15 minutes.
 */
@Component
class LoginAttempts {

  static final Duration WINDOW = Duration.ofMinutes(15);
  static final int MAX_EMAIL_FAILURES = 5;
  static final int MAX_ADDRESS_FAILURES = 20;
  private static final int PRUNE_THRESHOLD = 10_000;

  private record Window(Instant start, int failures) {}

  private final Clock clock;
  private final Map<String, Window> emails = new ConcurrentHashMap<>();
  private final Map<String, Window> addresses = new ConcurrentHashMap<>();

  LoginAttempts(Clock clock) {
    this.clock = clock;
  }

  /** Returns how long the caller must wait, or empty when the attempt may go ahead. */
  Optional<Duration> retryAfter(String email, String address) {
    Instant now = clock.instant();
    Duration wait = max(wait(emails, email, MAX_EMAIL_FAILURES, now), Duration.ZERO);
    wait = max(wait(addresses, address, MAX_ADDRESS_FAILURES, now), wait);
    return wait.isZero() ? Optional.empty() : Optional.of(wait);
  }

  /** Counts one failed attempt for the email and the address. */
  void failed(String email, String address) {
    Instant now = clock.instant();
    count(emails, email, now);
    count(addresses, address, now);
  }

  /** Clears the email's failures after a successful sign-in; the address count is kept. */
  void succeeded(String email) {
    emails.remove(email);
  }

  /** Forgets every count. */
  void clear() {
    emails.clear();
    addresses.clear();
  }

  private static Duration wait(Map<String, Window> windows, String key, int max, Instant now) {
    Window window = windows.get(key);
    if (window == null || window.failures() < max) {
      return Duration.ZERO;
    }
    Duration left = Duration.between(now, window.start().plus(WINDOW));
    return left.isNegative() ? Duration.ZERO : left;
  }

  private static void count(Map<String, Window> windows, String key, Instant now) {
    if (windows.size() > PRUNE_THRESHOLD) {
      windows.values().removeIf(w -> expired(w, now));
    }
    windows.compute(
        key,
        (k, w) ->
            w == null || expired(w, now)
                ? new Window(now, 1)
                : new Window(w.start(), w.failures() + 1));
  }

  private static boolean expired(Window window, Instant now) {
    return !now.isBefore(window.start().plus(WINDOW));
  }

  private static Duration max(Duration a, Duration b) {
    return a.compareTo(b) >= 0 ? a : b;
  }
}
