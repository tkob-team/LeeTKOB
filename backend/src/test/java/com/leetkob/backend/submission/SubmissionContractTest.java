package com.leetkob.backend.submission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.json.JsonMapper;

/**
 * Contract tests for {@code POST /labs/{labId}/submissions}, one group per rule in
 * docs/contract/post-labs-submissions.md. Every test goes through the real HTTP layer and the real
 * database; nothing about the endpoint is mocked.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({
  com.leetkob.backend.TestcontainersConfiguration.class,
  SubmissionContractTest.TestClockConfiguration.class
})
class SubmissionContractTest {

  private static final String SECRET = com.leetkob.backend.TestcontainersConfiguration.JWT_SECRET;
  private static final String TYPE_PREFIX = "urn:leetkob:problem:";
  private static final Instant NOW = Instant.parse("2026-11-10T03:00:00.000Z");
  private static final String CODE = "#include <iostream>\nint main() { std::cout << 1; }\n";
  private static final String KEY = "key-aaaaaaaaaaaaaaaa-0001";
  private static final JsonMapper JSON = JsonMapper.builder().build();

  /** Clock the tests can move; it can also be told to fail to provoke a 500. */
  static class TestClock extends Clock {
    private final AtomicReference<Instant> now = new AtomicReference<>(NOW);
    private final AtomicBoolean failing = new AtomicBoolean();
    private final AtomicReference<Instant> nextProcessingTime = new AtomicReference<>();

    void set(Instant instant) {
      now.set(instant);
      failing.set(false);
      nextProcessingTime.set(null);
    }

    void advanceAfterReceiptTo(Instant instant) {
      nextProcessingTime.set(instant);
    }

    void fail() {
      failing.set(true);
    }

    @Override
    public java.time.ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(java.time.ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      if (failing.get()) {
        throw new IllegalStateException("clock failure injected by test");
      }
      return now.get();
    }
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class TestClockConfiguration {
    @Bean
    @Primary
    TestClock testClock() {
      return new TestClock();
    }

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE + 1)
    OncePerRequestFilter processingDelay(TestClock clock) {
      return new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
          Instant processingTime = clock.nextProcessingTime.getAndSet(null);
          if (processingTime != null) {
            clock.set(processingTime);
          }
          chain.doFilter(request, response);
        }
      };
    }
  }

  @Autowired private MockMvc mvc;
  @Autowired private JdbcClient jdbc;
  @Autowired private TestClock clock;

  private UUID studentId;
  private UUID otherStudentId;
  private UUID taId;
  private UUID classId;
  private UUID otherClassId;
  private UUID labId;
  private UUID otherClassLabId;

  @BeforeEach
  void seed() {
    jdbc.sql("truncate submissions, labs, class_members, classes, users cascade").update();
    clock.set(NOW);
    studentId = user();
    otherStudentId = user();
    taId = user();
    classId = classWithMembers(studentId);
    otherClassId = classWithMembers(otherStudentId);
    labId = lab(classId, NOW.minus(Duration.ofHours(1)), NOW.plus(Duration.ofHours(1)));
    otherClassLabId =
        lab(otherClassId, NOW.minus(Duration.ofHours(1)), NOW.plus(Duration.ofHours(1)));
  }

  // ---- who may call it -------------------------------------------------------------------

  @Test
  void studentOfClassCreatesSubmission() throws Exception {
    submit(labId, token(studentId, "STUDENT"), KEY, CODE)
        .andExpect(status().isCreated())
        .andExpect(header().string("Content-Type", "application/json"))
        .andExpect(header().doesNotExist("Idempotency-Replayed"))
        .andExpect(jsonPath("$.id").isString())
        .andExpect(jsonPath("$.labId").value(labId.toString()))
        .andExpect(jsonPath("$.studentId").value(studentId.toString()))
        .andExpect(jsonPath("$.status").value("queued"))
        .andExpect(jsonPath("$.submittedAt").value("2026-11-10T03:00:00.000Z"))
        .andExpect(jsonPath("$.sizeBytes").value(CODE.getBytes(StandardCharsets.UTF_8).length))
        .andExpect(jsonPath("$.code").doesNotExist());
    assertThat(rows()).isEqualTo(1);
  }

  @Test
  void studentIdIsTokenSubject() throws Exception {
    UUID second = user();
    jdbc.sql("insert into class_members(class_id, user_id) values (?, ?)")
        .params(classId, second)
        .update();
    submit(labId, token(second, "STUDENT"), KEY, CODE)
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.studentId").value(second.toString()));
    assertThat(
            jdbc.sql("select count(*) from submissions where student_id = ?")
                .param(second)
                .query(Integer.class)
                .single())
        .isEqualTo(1);
  }

  @Test
  void taAndAdminAreForbidden() throws Exception {
    for (String role : List.of("TA", "ADMIN")) {
      problem(submit(labId, token(taId, role), KEY, CODE), 403, "forbidden-role");
    }
    assertThat(rows()).isZero();
  }

  @Test
  void roleIsCheckedBeforeContentType() throws Exception {
    problem(
        post(path(labId))
            .header("Authorization", "Bearer " + token(taId, "TA"))
            .header("Idempotency-Key", KEY)
            .contentType("text/plain")
            .content("x"),
        403,
        "forbidden-role");
  }

  @Test
  void otherClassStudentGetsLabNotFound() throws Exception {
    String token = token(studentId, "STUDENT");
    String foreign =
        submit(otherClassLabId, token, KEY, CODE).andReturn().getResponse().getContentAsString();
    String unknown =
        submit(UUID.randomUUID(), token, KEY, CODE).andReturn().getResponse().getContentAsString();
    problem(submit(otherClassLabId, token, KEY, CODE), 404, "lab-not-found");
    problem(submit(UUID.randomUUID(), token, KEY, CODE), 404, "lab-not-found");
    // Same answer for both, apart from the request path.
    assertThat(JSON.readTree(foreign).get("title")).isEqualTo(JSON.readTree(unknown).get("title"));
    assertThat(JSON.readTree(foreign).get("detail"))
        .isEqualTo(JSON.readTree(unknown).get("detail"));
    assertThat(rows()).isZero();
  }

  @Test
  void nonMemberWithoutKeyGetsKeyError() throws Exception {
    problem(
        post(path(otherClassLabId))
            .header("Authorization", "Bearer " + token(studentId, "STUDENT"))
            .contentType("application/json")
            .content(body(CODE)),
        400,
        "idempotency-key-required");
  }

  @Test
  void removedMemberReplayGetsNotFound() throws Exception {
    String token = token(studentId, "STUDENT");
    submit(labId, token, KEY, CODE).andExpect(status().isCreated());
    jdbc.sql("delete from class_members where user_id = ?").param(studentId).update();
    problem(submit(labId, token, KEY, CODE), 404, "lab-not-found");
  }

  @Test
  void unauthenticatedRequestsAreRejected() throws Exception {
    Instant exp = Instant.now().plus(Duration.ofHours(1));
    List<String> tokens = new ArrayList<>();
    tokens.add(null);
    tokens.add("not-a-jwt");
    tokens.add(
        token(
            studentId,
            "STUDENT",
            exp,
            "wrong-secret-wrong-secret-wrong-secret-00",
            JWSAlgorithm.HS256));
    tokens.add(
        token(
            studentId,
            "STUDENT",
            Instant.now().minus(Duration.ofHours(1)),
            SECRET,
            JWSAlgorithm.HS256));
    tokens.add(token(studentId, "STUDENT", exp, SECRET, JWSAlgorithm.HS512));
    tokens.add(rawToken(null, "STUDENT"));
    tokens.add(rawToken(studentId.toString(), null));
    tokens.add(rawToken(studentId.toString(), "student"));
    tokens.add(rawToken(studentId.toString(), "OWNER"));
    tokens.add(rawToken("not-a-uuid", "STUDENT"));
    tokens.add(token(UUID.randomUUID(), "STUDENT"));
    for (String token : tokens) {
      MockHttpServletRequestBuilder request =
          post(path(labId))
              .header("Idempotency-Key", KEY)
              .contentType("application/json")
              .content(body(CODE));
      if (token != null) {
        request.header("Authorization", "Bearer " + token);
      }
      problem(request, 401, "unauthenticated")
          .andExpect(header().string("WWW-Authenticate", "Bearer"));
    }
    assertThat(rows()).isZero();
  }

  // ---- request rules ---------------------------------------------------------------------

  @Test
  void tokenWithoutExpiryIsUnauthenticated() throws Exception {
    SignedJWT jwt =
        new SignedJWT(
            new JWSHeader(JWSAlgorithm.HS256),
            new JWTClaimsSet.Builder()
                .subject(studentId.toString())
                .claim("role", "STUDENT")
                .build());
    jwt.sign(new MACSigner(SECRET.getBytes(StandardCharsets.UTF_8)));
    problem(submit(labId, jwt.serialize(), KEY, CODE), 401, "unauthenticated");
    assertThat(rows()).isZero();
  }

  @Test
  void recentlyExpiredTokenIsUnauthenticated() throws Exception {
    String jwt =
        token(studentId, "STUDENT", Instant.now().minusSeconds(1), SECRET, JWSAlgorithm.HS256);
    problem(submit(labId, jwt, KEY, CODE), 401, "unauthenticated");
    assertThat(rows()).isZero();
  }

  @Test
  void receivedBeforeDeadlineIsAcceptedAfterProcessingCrossesDeadline() throws Exception {
    clock.set(NOW.plusSeconds(3599).plusNanos(999_999_999));
    clock.advanceAfterReceiptTo(NOW.plus(Duration.ofHours(2)));
    submit(labId, token(studentId, "STUDENT"), KEY, CODE)
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.submittedAt").value("2026-11-10T03:59:59.999Z"));
    assertThat(rows()).isEqualTo(1);
  }

  @Test
  void receivedBeforeOpeningStaysRejectedAfterProcessingCrossesOpening() throws Exception {
    UUID futureLab = lab(classId, NOW.plusSeconds(1), NOW.plus(Duration.ofHours(1)));
    clock.advanceAfterReceiptTo(NOW.plusSeconds(2));
    problem(submit(futureLab, token(studentId, "STUDENT"), KEY, CODE), 409, "lab-not-open");
    assertThat(rows()).isZero();
  }

  @Test
  void deadlineComparisonDoesNotTruncateReceiptToMilliseconds() throws Exception {
    UUID preciseLab = lab(classId, NOW.minusSeconds(1), NOW.plusNanos(500_000));
    clock.set(NOW.plusNanos(750_000));
    problem(submit(preciseLab, token(studentId, "STUDENT"), KEY, CODE), 409, "lab-closed");
    assertThat(rows()).isZero();
  }

  @Test
  void unsupportedMediaTypeIsRejected() throws Exception {
    for (String type : List.of("text/plain", "application/json; charset=iso-8859-1")) {
      problem(
          post(path(labId))
              .header("Authorization", "Bearer " + token(studentId, "STUDENT"))
              .header("Idempotency-Key", KEY)
              .contentType(type)
              .content(body(CODE)),
          415,
          "unsupported-media-type");
    }
    submit(labId, token(studentId, "STUDENT"), KEY, CODE, "application/json; charset=utf-8")
        .andExpect(status().isCreated());
  }

  @Test
  void idempotencyKeyIsRequired() throws Exception {
    problem(
        post(path(labId))
            .header("Authorization", "Bearer " + token(studentId, "STUDENT"))
            .contentType("application/json")
            .content(body(CODE)),
        400,
        "idempotency-key-required");
  }

  @Test
  void malformedIdempotencyKeyIsInvalidRequest() throws Exception {
    for (String key :
        List.of("short", "a".repeat(65), "key with spaces aaaaaaaa", " " + KEY, KEY + "!")) {
      problem(submit(labId, token(studentId, "STUDENT"), key, CODE), 400, "invalid-request")
          .andExpect(jsonPath("$.errors[0].field").value("Idempotency-Key"));
    }
    problem(
        post(path(labId))
            .header("Authorization", "Bearer " + token(studentId, "STUDENT"))
            .header("Idempotency-Key", KEY, KEY)
            .contentType("application/json")
            .content(body(CODE)),
        400,
        "invalid-request");
    submit(labId, token(studentId, "STUDENT"), "A".repeat(16), CODE)
        .andExpect(status().isCreated());
    submit(labId, token(studentId, "STUDENT"), "a".repeat(16), CODE)
        .andExpect(status().isCreated());
    assertThat(rows()).isEqualTo(2);
  }

  @Test
  void invalidLabIdIsInvalidRequest() throws Exception {
    problem(submit("not-a-uuid", token(studentId, "STUDENT"), KEY, CODE), 400, "invalid-request")
        .andExpect(jsonPath("$.errors[0].field").value("labId"));
  }

  @Test
  void upperCaseLabIdIsAcceptedAndNormalized() throws Exception {
    submit(labId.toString().toUpperCase(), token(studentId, "STUDENT"), KEY, CODE)
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.labId").value(labId.toString()));
  }

  @Test
  void invalidBodiesAreInvalidRequest() throws Exception {
    List<String> bodies =
        List.of(
            "{not json",
            "",
            "[]",
            "\"code\"",
            "{}",
            "{\"code\": null}",
            "{\"code\": 5}",
            "{\"code\": \"   \\n\\t \"}",
            "{\"code\": \"\\u3000\\u00a0\"}",
            "{\"code\": \"int main(){}\", \"language\": \"cpp\"}");
    for (String body : bodies) {
      problem(rawSubmit(labId, token(studentId, "STUDENT"), KEY, body), 400, "invalid-request");
    }
    problem(
        post(path(labId))
            .header("Authorization", "Bearer " + token(studentId, "STUDENT"))
            .header("Idempotency-Key", KEY)
            .contentType("application/json")
            .content(
                new byte[] {
                  '{', '"', 'c', 'o', 'd', 'e', '"', ':', '"', (byte) 0xC3, (byte) 0x28, '"', '}'
                }),
        400,
        "invalid-request");
    assertThat(rows()).isZero();
  }

  @Test
  void invalidRequestReportsFieldNames() throws Exception {
    problem(
            rawSubmit(labId, token(studentId, "STUDENT"), KEY, "{\"code\": \"  \"}"),
            400,
            "invalid-request")
        .andExpect(jsonPath("$.errors[0].field").value("code"))
        .andExpect(jsonPath("$.errors[0].detail").isString());
    problem(rawSubmit(labId, token(studentId, "STUDENT"), KEY, "{not json"), 400, "invalid-request")
        .andExpect(jsonPath("$.errors[0].field").value("body"));
  }

  @Test
  void codeKeepsExactBytes() throws Exception {
    String code = "  int main(){}\r\né\n";
    submit(labId, token(studentId, "STUDENT"), KEY, code)
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.sizeBytes").value(code.getBytes(StandardCharsets.UTF_8).length));
    assertThat(jdbc.sql("select code from submissions").query(String.class).single())
        .isEqualTo(code);
  }

  @Test
  void codeTooLargeIsRejectedAndNotStored() throws Exception {
    String token = token(studentId, "STUDENT");
    problem(submit(labId, token, KEY, "a".repeat(65_537)), 413, "code-too-large");
    problem(submit(labId, token, KEY, "é".repeat(32_769)), 413, "code-too-large");
    problem(
        rawSubmit(labId, token, KEY, "{\"code\": \"" + "a".repeat(270_000) + "\"}"),
        413,
        "code-too-large");
    assertThat(rows()).isZero();
    submit(labId, token, KEY, "a".repeat(65_536)).andExpect(status().isCreated());
    assertThat(rows()).isEqualTo(1);
  }

  @Test
  void oversizedCodeCreatesNoSubmission() throws Exception {
    problem(
        submit(labId, token(studentId, "STUDENT"), KEY, "a".repeat(70_000)), 413, "code-too-large");
    assertThat(rows()).isZero();
  }

  @Test
  void methodNotAllowedReturnsProblemBody() throws Exception {
    problem(
            get(path(labId)).header("Authorization", "Bearer " + token(studentId, "STUDENT")),
            405,
            "method-not-allowed")
        .andExpect(header().string("Allow", "POST"));
  }

  @Test
  void errorInstanceIsPathWithoutQuery() throws Exception {
    problem(
            post(path(labId) + "?x=1")
                .header("Authorization", "Bearer " + token(taId, "TA"))
                .header("Idempotency-Key", KEY)
                .contentType("application/json")
                .content(body(CODE)),
            403,
            "forbidden-role")
        .andExpect(jsonPath("$.instance").value(path(labId)));
  }

  // ---- lab time window -------------------------------------------------------------------

  @Test
  void labNotOpenIsConflict() throws Exception {
    UUID later = lab(classId, NOW.plus(Duration.ofHours(2)), NOW.plus(Duration.ofHours(3)));
    problem(submit(later, token(studentId, "STUDENT"), KEY, CODE), 409, "lab-not-open");
    clock.set(NOW.plus(Duration.ofHours(2)));
    submit(later, token(studentId, "STUDENT"), KEY, CODE).andExpect(status().isCreated());
  }

  @Test
  void submissionAtDueAtIsLate() throws Exception {
    String token = token(studentId, "STUDENT");
    clock.set(NOW.plus(Duration.ofHours(1)).minusMillis(1));
    submit(labId, token, KEY, CODE).andExpect(status().isCreated());
    clock.set(NOW.plus(Duration.ofHours(1)));
    problem(submit(labId, token, "key-bbbbbbbbbbbbbbbb-0002", CODE), 409, "lab-closed");
    assertThat(rows()).isEqualTo(1);
  }

  // ---- idempotency -----------------------------------------------------------------------

  @Test
  void sameKeySameBodyReplaysWithoutNewRow() throws Exception {
    String token = token(studentId, "STUDENT");
    String first = submit(labId, token, KEY, CODE).andReturn().getResponse().getContentAsString();
    clock.set(NOW.plusSeconds(30));
    ResultActions replay = submit(labId, token, KEY, CODE);
    replay.andExpect(status().isOk()).andExpect(header().string("Idempotency-Replayed", "true"));
    assertThat(JSON.readTree(replay.andReturn().getResponse().getContentAsString()))
        .isEqualTo(JSON.readTree(first));
    assertThat(rows()).isEqualTo(1);
  }

  @Test
  void replayAfterDeadlineStillReturnsOriginal() throws Exception {
    String token = token(studentId, "STUDENT");
    submit(labId, token, KEY, CODE).andExpect(status().isCreated());
    clock.set(NOW.plus(Duration.ofHours(5)));
    submit(labId, token, KEY, CODE)
        .andExpect(status().isOk())
        .andExpect(header().string("Idempotency-Replayed", "true"));
    problem(submit(labId, token, "key-bbbbbbbbbbbbbbbb-0002", CODE), 409, "lab-closed");
  }

  @Test
  void newKeyCreatesNewSubmission() throws Exception {
    String token = token(studentId, "STUDENT");
    submit(labId, token, KEY, CODE).andExpect(status().isCreated());
    submit(labId, token, "key-bbbbbbbbbbbbbbbb-0002", CODE).andExpect(status().isCreated());
    assertThat(rows()).isEqualTo(2);
  }

  @Test
  void sameKeyDifferentBodyIsRejected() throws Exception {
    String token = token(studentId, "STUDENT");
    submit(labId, token, KEY, CODE).andExpect(status().isCreated());
    problem(submit(labId, token, KEY, CODE + "// changed\n"), 422, "idempotency-key-reused");
    UUID second = lab(classId, NOW.minus(Duration.ofHours(1)), NOW.plus(Duration.ofHours(1)));
    problem(submit(second, token, KEY, CODE), 422, "idempotency-key-reused");
    assertThat(rows()).isEqualTo(1);
  }

  @Test
  void reusedKeyWithDifferentCodeOnClosedLabIsReused() throws Exception {
    String token = token(studentId, "STUDENT");
    submit(labId, token, KEY, CODE).andExpect(status().isCreated());
    clock.set(NOW.plus(Duration.ofHours(5)));
    problem(submit(labId, token, KEY, CODE + "// changed\n"), 422, "idempotency-key-reused");
  }

  @Test
  void retryWithInvalidBodyGetsItsOwnError() throws Exception {
    String token = token(studentId, "STUDENT");
    submit(labId, token, KEY, CODE).andExpect(status().isCreated());
    problem(rawSubmit(labId, token, KEY, "{\"code\": \"  \"}"), 400, "invalid-request");
    problem(submit(labId, token, KEY, "a".repeat(70_000)), 413, "code-too-large");
  }

  @Test
  void otherStudentsSameKeyIsIndependent() throws Exception {
    jdbc.sql("insert into class_members(class_id, user_id) values (?, ?)")
        .params(classId, otherStudentId)
        .update();
    submit(labId, token(studentId, "STUDENT"), KEY, CODE).andExpect(status().isCreated());
    submit(labId, token(otherStudentId, "STUDENT"), KEY, CODE + "// mine\n")
        .andExpect(status().isCreated());
    assertThat(rows()).isEqualTo(2);
  }

  @Test
  void concurrentSameKeyCreatesOneSubmission() throws Exception {
    String token = token(studentId, "STUDENT");
    int threads = 8;
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    try {
      List<Callable<Integer>> calls = new ArrayList<>();
      for (int i = 0; i < threads; i++) {
        calls.add(() -> submit(labId, token, KEY, CODE).andReturn().getResponse().getStatus());
      }
      List<Integer> statuses = new ArrayList<>();
      for (Future<Integer> future : pool.invokeAll(calls)) {
        statuses.add(future.get());
      }
      assertThat(statuses.stream().filter(s -> s == 201).count()).isEqualTo(1);
      assertThat(statuses.stream().filter(s -> s == 200).count()).isEqualTo(threads - 1);
    } finally {
      pool.shutdownNow();
    }
    assertThat(rows()).isEqualTo(1);
  }

  // ---- failures --------------------------------------------------------------------------

  @Test
  void unexpectedFailureIsInternalErrorWithoutDetails() throws Exception {
    String token = token(studentId, "STUDENT");
    clock.fail();
    ResultActions result = problem(submit(labId, token, KEY, CODE), 500, "internal-error");
    String body = result.andReturn().getResponse().getContentAsString();
    assertThat(body).doesNotContain("Exception", "clock failure", "at com.", "sql");
  }

  @Test
  void problemResponsesUseProblemJson() throws Exception {
    problem(submit(labId, token(taId, "TA"), KEY, CODE), 403, "forbidden-role")
        .andExpect(header().string("Content-Type", "application/problem+json"))
        .andExpect(jsonPath("$.title").isString())
        .andExpect(jsonPath("$.detail").isString())
        .andExpect(jsonPath("$.instance").value(path(labId)))
        .andExpect(jsonPath("$.status").value(403));
  }

  // ---- helpers ---------------------------------------------------------------------------

  private ResultActions problem(MockHttpServletRequestBuilder request, int status, String type)
      throws Exception {
    return problem(mvc.perform(request), status, type);
  }

  private ResultActions problem(ResultActions result, int status, String type) throws Exception {
    return result
        .andExpect(status().is(status))
        .andExpect(header().string("Content-Type", "application/problem+json"))
        .andExpect(jsonPath("$.type").value(TYPE_PREFIX + type))
        .andExpect(jsonPath("$.status").value(status));
  }

  private ResultActions submit(UUID lab, String token, String key, String code) throws Exception {
    return submit(lab.toString(), token, key, code);
  }

  private ResultActions submit(String lab, String token, String key, String code) throws Exception {
    return rawSubmit(lab, token, key, body(code));
  }

  private ResultActions submit(UUID lab, String token, String key, String code, String type)
      throws Exception {
    return mvc.perform(
        post(path(lab))
            .header("Authorization", "Bearer " + token)
            .header("Idempotency-Key", key)
            .contentType(type)
            .content(body(code)));
  }

  private ResultActions rawSubmit(UUID lab, String token, String key, String body)
      throws Exception {
    return rawSubmit(lab.toString(), token, key, body);
  }

  private ResultActions rawSubmit(String lab, String token, String key, String body)
      throws Exception {
    return mvc.perform(
        post("/labs/" + lab + "/submissions")
            .header("Authorization", "Bearer " + token)
            .header("Idempotency-Key", key)
            .contentType("application/json")
            .content(body));
  }

  private static String path(UUID lab) {
    return "/labs/" + lab + "/submissions";
  }

  private static String body(String code) {
    return JSON.writeValueAsString(java.util.Map.of("code", code));
  }

  private int rows() {
    return jdbc.sql("select count(*) from submissions").query(Integer.class).single();
  }

  private UUID user() {
    UUID id = UUID.randomUUID();
    jdbc.sql("insert into users(id) values (?)").param(id).update();
    return id;
  }

  private UUID classWithMembers(UUID... members) {
    UUID id = UUID.randomUUID();
    jdbc.sql("insert into classes(id, name) values (?, ?)").params(id, "class-" + id).update();
    for (UUID member : members) {
      jdbc.sql("insert into class_members(class_id, user_id) values (?, ?)")
          .params(id, member)
          .update();
    }
    return id;
  }

  private UUID lab(UUID inClass, Instant opensAt, Instant dueAt) {
    UUID id = UUID.randomUUID();
    jdbc.sql("insert into labs(id, class_id, opens_at, due_at) values (?, ?, ?, ?)")
        .params(id, inClass, Timestamp.from(opensAt), Timestamp.from(dueAt))
        .update();
    return id;
  }

  private static String token(UUID subject, String role) throws Exception {
    return token(
        subject, role, Instant.now().plus(Duration.ofHours(1)), SECRET, JWSAlgorithm.HS256);
  }

  private static String token(
      UUID subject, String role, Instant exp, String secret, JWSAlgorithm alg) throws Exception {
    return sign(subject.toString(), role, exp, secret, alg);
  }

  private static String rawToken(String subject, String role) throws Exception {
    return sign(subject, role, Instant.now().plus(Duration.ofHours(1)), SECRET, JWSAlgorithm.HS256);
  }

  private static String sign(
      String subject, String role, Instant exp, String secret, JWSAlgorithm alg) throws Exception {
    JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder().expirationTime(Date.from(exp));
    if (subject != null) {
      claims.subject(subject);
    }
    if (role != null) {
      claims.claim("role", role);
    }
    SignedJWT jwt = new SignedJWT(new JWSHeader(alg), claims.build());
    byte[] key = secret.getBytes(StandardCharsets.UTF_8);
    if (alg == JWSAlgorithm.HS512 && key.length < 64) {
      key = java.util.Arrays.copyOf(key, 64);
    }
    jwt.sign(new MACSigner(key));
    return jwt.serialize();
  }
}
