package com.leetkob.backend.submission;

import com.leetkob.backend.problem.ApiException;
import com.leetkob.backend.problem.ApiException.FieldError;
import com.leetkob.backend.problem.ProblemType;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Validates the HTTP parts of a submission request, in the order the contract defines. */
@Component
class SubmissionRequestParser {

  static final int MAX_CODE_BYTES = 65_536;
  static final int MAX_BODY_BYTES = 262_144;

  private static final Pattern KEY_FORMAT = Pattern.compile("[A-Za-z0-9_-]{16,64}");
  private static final Pattern UUID_FORMAT =
      Pattern.compile(
          "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
  private static final Pattern BLANK = Pattern.compile("\\p{IsWhite_Space}*");

  private final JsonMapper json;

  SubmissionRequestParser(JsonMapper json) {
    this.json = json;
  }

  /** Step 3: the body must be {@code application/json} with no charset or UTF-8. */
  void checkContentType(HttpServletRequest request) {
    String header = request.getContentType();
    boolean ok = false;
    if (header != null) {
      try {
        MediaType type = MediaType.parseMediaType(header);
        ok =
            MediaType.APPLICATION_JSON.equalsTypeAndSubtype(type)
                && (type.getCharset() == null || StandardCharsets.UTF_8.equals(type.getCharset()));
      } catch (InvalidMediaTypeException e) {
        ok = false;
      }
    }
    if (!ok) {
      throw new ApiException(
          ProblemType.UNSUPPORTED_MEDIA_TYPE, "Content-Type must be application/json (UTF-8).");
    }
  }

  /** Step 4: exactly one well-formed {@code Idempotency-Key} header. */
  String idempotencyKey(HttpServletRequest request) {
    List<String> values = Collections.list(request.getHeaders("Idempotency-Key"));
    if (values.isEmpty()) {
      throw new ApiException(
          ProblemType.IDEMPOTENCY_KEY_REQUIRED, "The Idempotency-Key header is required.");
    }
    if (values.size() > 1 || !KEY_FORMAT.matcher(values.get(0)).matches()) {
      throw invalid(
          "Idempotency-Key", "Must be one value of 16 to 64 characters from A-Z a-z 0-9 _ -.");
    }
    return values.get(0);
  }

  /** Step 5 (first half): the path value must be a UUID. */
  UUID labId(String value) {
    if (!UUID_FORMAT.matcher(value).matches()) {
      throw invalid("labId", "Must be a UUID.");
    }
    return UUID.fromString(value);
  }

  /** Step 6: reads and validates the body, returning the source code. */
  String code(HttpServletRequest request) throws IOException {
    byte[] bytes = request.getInputStream().readNBytes(MAX_BODY_BYTES + 1);
    if (bytes.length > MAX_BODY_BYTES) {
      throw tooLarge();
    }
    String text;
    try {
      text =
          StandardCharsets.UTF_8
              .newDecoder()
              .onMalformedInput(CodingErrorAction.REPORT)
              .onUnmappableCharacter(CodingErrorAction.REPORT)
              .decode(ByteBuffer.wrap(bytes))
              .toString();
    } catch (CharacterCodingException e) {
      throw invalid("body", "Body is not valid UTF-8.");
    }
    JsonNode root;
    try {
      root = json.readTree(text);
    } catch (JacksonException e) {
      throw invalid("body", "Body is not valid JSON.");
    }
    if (root == null || !root.isObject()) {
      throw invalid("body", "Body must be a single JSON object.");
    }
    for (String name : root.propertyNames()) {
      if (!"code".equals(name)) {
        throw invalid("body", "Unknown field: " + name + ".");
      }
    }
    JsonNode code = root.get("code");
    if (code == null || !code.isString()) {
      throw invalid("code", "Required, must be a string.");
    }
    String value = code.stringValue();
    if (BLANK.matcher(value).matches()) {
      throw invalid("code", "Must not be blank.");
    }
    if (value.getBytes(StandardCharsets.UTF_8).length > MAX_CODE_BYTES) {
      throw tooLarge();
    }
    return value;
  }

  private static ApiException tooLarge() {
    return new ApiException(
        ProblemType.CODE_TOO_LARGE, "Code must be at most " + MAX_CODE_BYTES + " bytes in UTF-8.");
  }

  private static ApiException invalid(String field, String detail) {
    return new ApiException(
        ProblemType.INVALID_REQUEST,
        "The request is invalid.",
        List.of(new FieldError(field, detail)));
  }
}
