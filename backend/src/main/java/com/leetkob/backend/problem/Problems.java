package com.leetkob.backend.problem;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** Builds {@code application/problem+json} and plain JSON responses as raw bytes. */
@Component
public class Problems {

  private static final MediaType PROBLEM_JSON =
      MediaType.parseMediaType("application/problem+json");

  private final JsonMapper json;

  Problems(JsonMapper json) {
    this.json = json;
  }

  /** Serializes a value as JSON bytes. */
  public byte[] write(Object value) {
    return json.writeValueAsString(value).getBytes(StandardCharsets.UTF_8);
  }

  /** Builds the problem response for an exception, with {@code instance} set to the path. */
  public ResponseEntity<byte[]> response(ApiException exception, String instance) {
    ProblemType type = exception.type();
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("type", type.urn());
    body.put("title", type.title());
    body.put("status", type.status());
    body.put("detail", exception.getMessage());
    body.put("instance", instance);
    List<ApiException.FieldError> errors = exception.errors();
    if (!errors.isEmpty()) {
      body.put("errors", errors);
    }
    ResponseEntity.BodyBuilder builder =
        ResponseEntity.status(type.status()).contentType(PROBLEM_JSON);
    if (type == ProblemType.UNAUTHENTICATED) {
      builder.header(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
    }
    return builder.body(write(body));
  }
}
