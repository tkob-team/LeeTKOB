package com.leetkob.backend.problem;

/** Error types of the API, each with a stable URN, status and title (RFC 9457). */
public enum ProblemType {
  IDEMPOTENCY_KEY_REQUIRED("idempotency-key-required", 400, "Idempotency-Key header is required"),
  INVALID_REQUEST("invalid-request", 400, "Invalid request"),
  UNAUTHENTICATED("unauthenticated", 401, "Authentication is required"),
  FORBIDDEN_ROLE("forbidden-role", 403, "Role is not allowed to submit"),
  LAB_NOT_FOUND("lab-not-found", 404, "Lab not found"),
  METHOD_NOT_ALLOWED("method-not-allowed", 405, "Method not allowed"),
  LAB_NOT_OPEN("lab-not-open", 409, "Lab is not open yet"),
  LAB_CLOSED("lab-closed", 409, "Lab is closed"),
  CODE_TOO_LARGE("code-too-large", 413, "Code is too large"),
  UNSUPPORTED_MEDIA_TYPE("unsupported-media-type", 415, "Unsupported media type"),
  IDEMPOTENCY_KEY_REUSED(
      "idempotency-key-reused", 422, "Idempotency-Key was used for another request"),
  INTERNAL_ERROR("internal-error", 500, "Internal error");

  private final String urn;
  private final int status;
  private final String title;

  ProblemType(String name, int status, String title) {
    this.urn = "urn:leetkob:problem:" + name;
    this.status = status;
    this.title = title;
  }

  /** Returns the stable type URN. */
  public String urn() {
    return urn;
  }

  /** Returns the HTTP status code. */
  public int status() {
    return status;
  }

  /** Returns the human-readable title. */
  public String title() {
    return title;
  }
}
