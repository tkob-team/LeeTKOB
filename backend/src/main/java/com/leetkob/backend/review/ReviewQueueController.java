package com.leetkob.backend.review;

import com.leetkob.backend.problem.ApiException;
import com.leetkob.backend.problem.ProblemType;
import java.math.BigDecimal;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** {@code GET /labs/{labId}/review-queue}, as specified in docs/contract/get-review-queue.md. */
@RestController
class ReviewQueueController {

  private static final DateTimeFormatter TIME =
      DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);
  private static final TypeReference<List<Map<String, Object>>> EVIDENCE = new TypeReference<>() {};

  private final ReviewQueueRepository repository;
  private final JsonMapper json;

  ReviewQueueController(ReviewQueueRepository repository, JsonMapper json) {
    this.repository = repository;
    this.json = json;
  }

  @GetMapping("/labs/{labId}/review-queue")
  ResponseEntity<Map<String, Object>> queue(
      @PathVariable String labId,
      @RequestParam(required = false) String page,
      @RequestParam(required = false) String size,
      @RequestParam(required = false) String includeEarlier,
      @AuthenticationPrincipal Jwt jwt) {
    UUID ta = requireTa(jwt);
    UUID lab = parseUuid(labId);
    int pageNumber = parseInt(page, 0, 0, Integer.MAX_VALUE, "page must be an integer >= 0.");
    int pageSize = parseInt(size, 20, 1, 100, "size must be an integer from 1 to 100.");
    boolean earlier = parseBoolean(includeEarlier);
    ReviewQueueRepository.Lab found =
        repository
            .labForTa(lab, ta)
            .orElseThrow(() -> new ApiException(ProblemType.LAB_NOT_FOUND, "Lab not found."));

    long total = repository.count(lab, earlier);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("labId", lab);
    body.put("provisional", found.provisional());
    body.put("page", pageNumber);
    body.put("size", pageSize);
    body.put("totalItems", total);
    body.put("totalPages", (total + pageSize - 1) / pageSize);
    body.put("items", items(repository.page(lab, earlier, pageNumber, pageSize)));
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
  }

  private List<Map<String, Object>> items(List<ReviewQueueRepository.Row> rows) {
    Map<UUID, Map<String, Object>> items = new LinkedHashMap<>();
    for (ReviewQueueRepository.Row row : rows) {
      Map<String, Object> item = items.computeIfAbsent(row.submissionId(), id -> item(row));
      if (row.code() != null) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> constraints = (List<Map<String, Object>>) item.get("constraints");
        constraints.add(constraint(row));
      }
    }
    for (Map<String, Object> item : items.values()) {
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> constraints = (List<Map<String, Object>>) item.get("constraints");
      boolean needsReview = constraints.stream().anyMatch(c -> (Boolean) c.get("needsReview"));
      boolean complete = constraints.stream().allMatch(c -> c.get("verdict") != null);
      Object verdict = item.get("verdict");
      String reviewStatus;
      if (verdict != null && !"AC".equals(verdict)) {
        reviewStatus = "not_checked";
      } else if (verdict != null && complete) {
        reviewStatus = "checked";
      } else {
        reviewStatus = "reviewing";
      }
      item.put("reviewStatus", reviewStatus);
      item.put("needsReview", needsReview);
      item.put("constraints", item.remove("constraints")); // keep constraints last
    }
    return new ArrayList<>(items.values());
  }

  private static Map<String, Object> item(ReviewQueueRepository.Row row) {
    Map<String, Object> student = new LinkedHashMap<>();
    student.put("id", row.studentId());
    student.put("displayName", row.displayName());
    Map<String, Object> item = new LinkedHashMap<>();
    item.put("submissionId", row.submissionId());
    item.put("counted", row.counted());
    item.put("student", student);
    item.put("submittedAt", TIME.format(row.submittedAt()));
    item.put("judgeStatus", row.judgeStatus());
    item.put("verdict", row.verdict());
    item.put("constraints", new ArrayList<Map<String, Object>>());
    return item;
  }

  private Map<String, Object> constraint(ReviewQueueRepository.Row row) {
    String verdict = row.findingVerdict();
    Map<String, Object> constraint = new LinkedHashMap<>();
    constraint.put("code", row.code());
    constraint.put("text", row.text());
    BigDecimal deduction = row.deduction();
    constraint.put("deduction", deduction);
    constraint.put("verdict", verdict);
    constraint.put("source", row.source());
    constraint.put(
        "evidence", row.evidence() == null ? List.of() : json.readValue(row.evidence(), EVIDENCE));
    constraint.put("reason", verdict == null ? null : row.reason());
    constraint.put("unsureCause", row.unsureCause());
    constraint.put("needsReview", "violation".equals(verdict) || "unsure".equals(verdict));
    return constraint;
  }

  private UUID requireTa(Jwt jwt) {
    UUID id = UUID.fromString(jwt.getSubject());
    String role =
        repository
            .role(id)
            .orElseThrow(() ->
                new ApiException(ProblemType.UNAUTHENTICATED, "The token's user does not exist."));
    if (!role.equals(jwt.getClaimAsString("role"))) {
      throw new ApiException(ProblemType.UNAUTHENTICATED, "The user's role has changed.");
    }
    if (!"TA".equals(role)) {
      throw new ApiException(
          ProblemType.FORBIDDEN_ROLE, "Only a TA of the lab's class can read the review queue.");
    }
    return id;
  }

  private static UUID parseUuid(String value) {
    try {
      UUID parsed = UUID.fromString(value);
      if (parsed.toString().equalsIgnoreCase(value)) {
        return parsed;
      }
    } catch (IllegalArgumentException ignored) {
      // A malformed identifier gets the same problem response as a shortened UUID.
    }
    throw new ApiException(ProblemType.INVALID_REQUEST, "labId must be a UUID.");
  }

  private static boolean parseBoolean(String value) {
    if (value == null || "false".equals(value)) {
      return false;
    }
    if ("true".equals(value)) {
      return true;
    }
    throw new ApiException(ProblemType.INVALID_REQUEST, "includeEarlier must be true or false.");
  }

  private static int parseInt(String value, int fallback, int min, int max, String message) {
    if (value == null) {
      return fallback;
    }
    try {
      int parsed = Integer.parseInt(value);
      if (parsed >= min && parsed <= max) {
        return parsed;
      }
    } catch (NumberFormatException ignored) {
      // Reported below with the same problem as an out-of-range value.
    }
    throw new ApiException(ProblemType.INVALID_REQUEST, message);
  }
}
