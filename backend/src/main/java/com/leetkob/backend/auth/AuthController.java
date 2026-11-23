package com.leetkob.backend.auth;

import com.leetkob.backend.problem.ApiException;
import com.leetkob.backend.problem.ApiException.FieldError;
import com.leetkob.backend.problem.ProblemType;
import com.leetkob.backend.problem.Problems;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** {@code POST /auth/login}, as specified in docs/contract/post-auth-login.md. */
@RestController
class AuthController {

  static final int MAX_BODY_BYTES = 4096;
  static final int MAX_EMAIL_CHARS = 254;
  static final int MAX_PASSWORD_BYTES = 72;
  private static final Set<String> FIELDS = Set.of("email", "password");

  private record Credentials(String email, String password) {}

  private final AuthRepository repository;
  private final PasswordEncoder passwords;
  private final TokenIssuer tokens;
  private final LoginAttempts attempts;
  private final Problems problems;
  private final JsonMapper json;

  /** Compared against when the account is unknown, so both cases cost one BCrypt check. */
  private final String dummyHash;

  AuthController(
      AuthRepository repository,
      PasswordEncoder passwords,
      TokenIssuer tokens,
      LoginAttempts attempts,
      Problems problems,
      JsonMapper json) {
    this.repository = repository;
    this.passwords = passwords;
    this.tokens = tokens;
    this.attempts = attempts;
    this.problems = problems;
    this.json = json;
    this.dummyHash = passwords.encode("leetkob-dummy-password-for-timing");
  }

  @PostMapping("/auth/login")
  ResponseEntity<?> login(HttpServletRequest request) throws IOException {
    checkContentType(request); // step 1
    Credentials credentials = credentials(request); // step 2
    String email = credentials.email().toLowerCase(Locale.ROOT);
    String address = request.getRemoteAddr();

    Optional<Duration> wait = attempts.retryAfter(email, address); // step 3
    if (wait.isPresent()) {
      return tooManyAttempts(wait.get(), request.getRequestURI());
    }

    Optional<AuthRepository.Account> account = repository.byEmail(email); // step 4
    String hash = account.map(AuthRepository.Account::passwordHash).orElse(null);
    boolean matches = passwords.matches(credentials.password(), hash == null ? dummyHash : hash);
    if (!matches || hash == null) {
      attempts.failed(email, address);
      throw new ApiException(
          ProblemType.INVALID_CREDENTIALS, "The email or the password is incorrect.");
    }

    AuthRepository.Account user = account.get(); // step 5
    attempts.succeeded(email);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("token", tokens.issue(user.id(), user.role()));
    body.put("role", user.role());
    body.put("displayName", user.displayName());
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
  }

  private ResponseEntity<byte[]> tooManyAttempts(Duration wait, String instance) {
    long seconds = Math.max(1, (wait.toMillis() + 999) / 1000);
    ResponseEntity<byte[]> problem =
        problems.response(
            new ApiException(
                ProblemType.TOO_MANY_ATTEMPTS,
                "Too many failed sign-in attempts. Try again in " + seconds + " seconds."),
            instance);
    return ResponseEntity.status(problem.getStatusCode())
        .headers(problem.getHeaders())
        .header(HttpHeaders.RETRY_AFTER, Long.toString(seconds))
        .body(problem.getBody());
  }

  private static void checkContentType(HttpServletRequest request) {
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

  private Credentials credentials(HttpServletRequest request) throws IOException {
    byte[] bytes = request.getInputStream().readNBytes(MAX_BODY_BYTES + 1);
    if (bytes.length > MAX_BODY_BYTES) {
      throw invalid("body", "Body must be at most " + MAX_BODY_BYTES + " bytes.");
    }
    JsonNode root;
    try {
      String text =
          StandardCharsets.UTF_8
              .newDecoder()
              .onMalformedInput(CodingErrorAction.REPORT)
              .onUnmappableCharacter(CodingErrorAction.REPORT)
              .decode(ByteBuffer.wrap(bytes))
              .toString();
      root = json.readTree(text);
    } catch (CharacterCodingException | JacksonException e) {
      throw invalid("body", "Body is not valid UTF-8 JSON.");
    }
    if (root == null || !root.isObject()) {
      throw invalid("body", "Body must be a single JSON object.");
    }
    for (String name : root.propertyNames()) {
      if (!FIELDS.contains(name)) {
        throw invalid("body", "Unknown field: " + name + ".");
      }
    }
    JsonNode email = root.get("email");
    if (email == null || !email.isString() || email.stringValue().isBlank()) {
      throw invalid("email", "Required, must be a non-blank string.");
    }
    String trimmed = email.stringValue().strip();
    if (trimmed.length() > MAX_EMAIL_CHARS) {
      throw invalid("email", "Must be at most " + MAX_EMAIL_CHARS + " characters.");
    }
    JsonNode password = root.get("password");
    if (password == null || !password.isString() || password.stringValue().isEmpty()) {
      throw invalid("password", "Required, must be a non-empty string.");
    }
    String value = password.stringValue();
    if (value.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
      throw invalid("password", "Must be at most " + MAX_PASSWORD_BYTES + " bytes in UTF-8.");
    }
    return new Credentials(trimmed, value);
  }

  private static ApiException invalid(String field, String detail) {
    return new ApiException(
        ProblemType.INVALID_REQUEST,
        "The request is invalid.",
        List.of(new FieldError(field, detail)));
  }
}
