package com.leetkob.backend.submission;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Captures receipt time before authentication, database access or body processing. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class RequestReceivedAtFilter extends OncePerRequestFilter {

  private static final String ATTRIBUTE = RequestReceivedAtFilter.class.getName() + ".receipt";

  private final Clock clock;

  private record Receipt(Instant instant, RuntimeException failure) {}

  RequestReceivedAtFilter(Clock clock) {
    this.clock = clock;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    Receipt receipt;
    try {
      receipt = new Receipt(clock.instant(), null);
    } catch (RuntimeException failure) {
      // Preserve authentication/validation/replay precedence and the RFC 9457 error handler.
      receipt = new Receipt(null, failure);
    }
    request.setAttribute(ATTRIBUTE, receipt);
    chain.doFilter(request, response);
  }

  static Instant receivedAt(HttpServletRequest request) {
    if (!(request.getAttribute(ATTRIBUTE) instanceof Receipt receipt)) {
      throw new IllegalStateException("Request receipt filter did not run.");
    }
    if (receipt.failure() != null) {
      throw receipt.failure();
    }
    return receipt.instant();
  }
}
