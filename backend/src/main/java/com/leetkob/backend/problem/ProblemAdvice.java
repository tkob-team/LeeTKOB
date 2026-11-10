package com.leetkob.backend.problem;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponse;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Turns exceptions thrown by controllers into RFC 9457 problem responses. */
@RestControllerAdvice
class ProblemAdvice {

  private static final Logger LOG = LoggerFactory.getLogger(ProblemAdvice.class);

  private final Problems problems;

  ProblemAdvice(Problems problems) {
    this.problems = problems;
  }

  @ExceptionHandler(ApiException.class)
  ResponseEntity<byte[]> apiException(ApiException exception, HttpServletRequest request) {
    return problems.response(exception, request.getRequestURI());
  }

  @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
  ResponseEntity<byte[]> methodNotSupported(
      HttpRequestMethodNotSupportedException exception, HttpServletRequest request) {
    ResponseEntity<byte[]> response =
        problems.response(
            new ApiException(
                ProblemType.METHOD_NOT_ALLOWED, "This HTTP method is not supported on this path."),
            request.getRequestURI());
    return ResponseEntity.status(response.getStatusCode())
        .headers(response.getHeaders())
        .header(HttpHeaders.ALLOW, String.join(", ", exception.getSupportedMethods()))
        .body(response.getBody());
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<byte[]> unexpected(Exception exception, HttpServletRequest request)
      throws Exception {
    if (exception instanceof ErrorResponse) {
      throw exception;
    }
    LOG.error("Unexpected failure on {}", request.getRequestURI(), exception);
    return problems.response(
        new ApiException(ProblemType.INTERNAL_ERROR, "The server could not process the request."),
        request.getRequestURI());
  }
}
