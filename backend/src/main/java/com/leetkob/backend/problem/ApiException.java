package com.leetkob.backend.problem;

import java.util.List;

/** A failure the API reports to the client as an RFC 9457 problem. */
public class ApiException extends RuntimeException {

  /** One invalid field and why. */
  public record FieldError(String field, String detail) {}

  private final transient ProblemType type;
  private final transient List<FieldError> errors;

  /** Creates an exception without field details. */
  public ApiException(ProblemType type, String detail) {
    this(type, detail, List.of());
  }

  /** Creates an exception with field details. */
  public ApiException(ProblemType type, String detail, List<FieldError> errors) {
    super(detail);
    this.type = type;
    this.errors = errors;
  }

  /** Returns the problem type. */
  public ProblemType type() {
    return type;
  }

  /** Returns the invalid fields, possibly empty. */
  public List<FieldError> errors() {
    return errors;
  }
}
