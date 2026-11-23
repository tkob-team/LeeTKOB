package com.leetkob.backend.lab;

import com.leetkob.backend.problem.ApiException;
import com.leetkob.backend.problem.ApiException.FieldError;
import com.leetkob.backend.problem.ProblemType;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Validates a lab authoring request body (docs/contract/lab-authoring.md section 2). */
@Component
class LabRequestParser {

  static final int MAX_BODY_BYTES = 4 * 1024 * 1024;
  static final int MAX_TITLE = 200;
  static final int MAX_STATEMENT = 65_536;
  static final int MAX_TESTS = 100;
  static final int MAX_TEST_BYTES = 1024 * 1024;
  static final int MAX_CONSTRAINTS = 20;
  static final int MAX_CONSTRAINT_TEXT = 2000;
  static final int DEFAULT_CPU_MS = 1000;
  static final int DEFAULT_MEMORY_MB = 256;

  private static final Set<String> FIELDS =
      Set.of(
          "title",
          "statementMd",
          "opensAt",
          "dueAt",
          "cpuTimeMs",
          "memoryMb",
          "tests",
          "constraints");
  private static final Set<String> TEST_FIELDS = Set.of("input", "expectedOutput");
  private static final Set<String> CONSTRAINT_FIELDS = Set.of("code", "text", "deduction");
  private static final Pattern CODE = Pattern.compile("C[1-9][0-9]?");
  private static final BigDecimal MAX_DEDUCTION = BigDecimal.TEN;

  /** One test case, in order. */
  record TestCase(String input, String expectedOutput) {}

  /** One constraint, in order. */
  record Constraint(String code, String text, BigDecimal deduction) {}

  /** A validated lab. */
  record NewLab(
      String title,
      String statementMd,
      Instant opensAt,
      Instant dueAt,
      int cpuTimeMs,
      int memoryMb,
      List<TestCase> tests,
      List<Constraint> constraints) {}

  private final JsonMapper json;

  LabRequestParser(JsonMapper json) {
    this.json = json;
  }

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

  NewLab parse(HttpServletRequest request) throws IOException {
    JsonNode root = readObject(request);
    onlyFields(root, FIELDS, "body");
    String title = text(root, "title", "title", MAX_TITLE, true);
    String statement = text(root, "statementMd", "statementMd", MAX_STATEMENT, false);
    Instant opensAt = instant(root, "opensAt");
    Instant dueAt = instant(root, "dueAt");
    if (!opensAt.isBefore(dueAt)) {
      throw invalid("dueAt", "Must be after opensAt.");
    }
    int cpu = integer(root, "cpuTimeMs", DEFAULT_CPU_MS, 1000, 5000);
    int memory = integer(root, "memoryMb", DEFAULT_MEMORY_MB, 64, 512);
    return new NewLab(
        title, statement, opensAt, dueAt, cpu, memory, tests(root), constraints(root));
  }

  private JsonNode readObject(HttpServletRequest request) throws IOException {
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
    return root;
  }

  private static List<TestCase> tests(JsonNode root) {
    JsonNode tests = root.get("tests");
    if (tests == null || !tests.isArray() || tests.isEmpty() || tests.size() > MAX_TESTS) {
      throw invalid("tests", "Required array of 1 to " + MAX_TESTS + " tests.");
    }
    List<TestCase> result = new ArrayList<>();
    for (int i = 0; i < tests.size(); i++) {
      String path = "tests[" + i + "]";
      JsonNode test = tests.get(i);
      if (!test.isObject()) {
        throw invalid(path, "Must be an object {input, expectedOutput}.");
      }
      onlyFields(test, TEST_FIELDS, path);
      result.add(new TestCase(rawText(test, "input", path), rawText(test, "expectedOutput", path)));
    }
    return result;
  }

  private static List<Constraint> constraints(JsonNode root) {
    JsonNode constraints = root.get("constraints");
    if (constraints == null) {
      return List.of();
    }
    if (!constraints.isArray() || constraints.size() > MAX_CONSTRAINTS) {
      throw invalid("constraints", "Must be an array of at most " + MAX_CONSTRAINTS + " items.");
    }
    List<Constraint> result = new ArrayList<>();
    Set<String> codes = new HashSet<>();
    for (int i = 0; i < constraints.size(); i++) {
      String path = "constraints[" + i + "]";
      JsonNode item = constraints.get(i);
      if (!item.isObject()) {
        throw invalid(path, "Must be an object {code, text, deduction}.");
      }
      onlyFields(item, CONSTRAINT_FIELDS, path);
      JsonNode code = item.get("code");
      if (code == null || !code.isString() || !CODE.matcher(code.stringValue()).matches()) {
        throw invalid(path + ".code", "Must be C1 to C99.");
      }
      if (!codes.add(code.stringValue())) {
        throw invalid(path + ".code", "Duplicate code " + code.stringValue() + ".");
      }
      String text = text(item, "text", path + ".text", MAX_CONSTRAINT_TEXT, true);
      result.add(new Constraint(code.stringValue(), text, deduction(item, path + ".deduction")));
    }
    return result;
  }

  private static BigDecimal deduction(JsonNode item, String path) {
    JsonNode node = item.get("deduction");
    if (node == null || !node.isNumber()) {
      throw invalid(path, "Required number in (0, 10].");
    }
    BigDecimal value = new BigDecimal(node.asString()).stripTrailingZeros();
    if (value.signum() <= 0 || value.compareTo(MAX_DEDUCTION) > 0 || value.scale() > 2) {
      throw invalid(path, "Must be in (0, 10] with at most two decimals.");
    }
    return value;
  }

  private static String text(JsonNode root, String name, String path, int max, boolean strip) {
    JsonNode node = root.get(name);
    if (node == null || !node.isString() || node.stringValue().isBlank()) {
      throw invalid(path, "Required, must be a non-blank string.");
    }
    String value = strip ? node.stringValue().strip() : node.stringValue();
    if (value.length() > max) {
      throw invalid(path, "Must be at most " + max + " characters.");
    }
    return value;
  }

  private static String rawText(JsonNode root, String name, String path) {
    JsonNode node = root.get(name);
    if (node == null || !node.isString()) {
      throw invalid(path + "." + name, "Required string.");
    }
    if (node.stringValue().getBytes(StandardCharsets.UTF_8).length > MAX_TEST_BYTES) {
      throw invalid(path + "." + name, "Must be at most " + MAX_TEST_BYTES + " bytes.");
    }
    return node.stringValue();
  }

  private static Instant instant(JsonNode root, String name) {
    JsonNode node = root.get(name);
    if (node == null || !node.isString()) {
      throw invalid(name, "Required RFC 3339 timestamp with an offset.");
    }
    try {
      return OffsetDateTime.parse(node.stringValue(), DateTimeFormatter.ISO_OFFSET_DATE_TIME)
          .toInstant();
    } catch (DateTimeParseException e) {
      throw invalid(name, "Required RFC 3339 timestamp with an offset.");
    }
  }

  private static int integer(JsonNode root, String name, int fallback, int min, int max) {
    JsonNode node = root.get(name);
    if (node == null) {
      return fallback;
    }
    if (!node.isIntegralNumber() || !node.canConvertToInt()) {
      throw invalid(name, "Must be an integer from " + min + " to " + max + ".");
    }
    int value = node.intValue();
    if (value < min || value > max) {
      throw invalid(name, "Must be an integer from " + min + " to " + max + ".");
    }
    return value;
  }

  private static void onlyFields(JsonNode node, Set<String> allowed, String path) {
    for (String name : node.propertyNames()) {
      if (!allowed.contains(name)) {
        throw invalid(path, "Unknown field: " + name + ".");
      }
    }
  }

  private static ApiException invalid(String field, String detail) {
    return new ApiException(
        ProblemType.INVALID_REQUEST,
        "The request is invalid.",
        List.of(new FieldError(field, detail)));
  }
}
