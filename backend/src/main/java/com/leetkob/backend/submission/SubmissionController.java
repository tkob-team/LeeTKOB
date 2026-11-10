package com.leetkob.backend.submission;

import com.leetkob.backend.problem.ApiException;
import com.leetkob.backend.problem.ProblemType;
import com.leetkob.backend.problem.Problems;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code POST /labs/{labId}/submissions}, as specified in docs/contract. */
@RestController
class SubmissionController {

  private static final DateTimeFormatter TIME =
      DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

  private final SubmissionRepository repository;
  private final SubmissionRequestParser parser;
  private final Problems problems;

  SubmissionController(
      SubmissionRepository repository, SubmissionRequestParser parser, Problems problems) {
    this.repository = repository;
    this.parser = parser;
    this.problems = problems;
  }

  @PostMapping("/labs/{labId}/submissions")
  ResponseEntity<byte[]> submit(
      @PathVariable String labId, HttpServletRequest request, @AuthenticationPrincipal Jwt jwt)
      throws IOException {
    // Step 1 is the security filter; the token has a valid sub and role by now.
    UUID studentId = UUID.fromString(jwt.getSubject());
    if (!repository.userExists(studentId)) {
      throw new ApiException(ProblemType.UNAUTHENTICATED, "The token's user does not exist.");
    }
    // Step 2
    if (!"STUDENT".equals(jwt.getClaimAsString("role"))) {
      throw new ApiException(ProblemType.FORBIDDEN_ROLE, "Only students can submit.");
    }
    parser.checkContentType(request); // step 3
    String key = parser.idempotencyKey(request); // step 4
    UUID lab = parser.labId(labId); // step 5
    SubmissionRepository.Lab found =
        repository
            .findLabForMember(lab, studentId)
            .orElseThrow(() -> new ApiException(ProblemType.LAB_NOT_FOUND, "Lab not found."));
    String code = parser.code(request); // step 6

    // Step 7
    var existing = repository.find(studentId, key);
    if (existing.isPresent()) {
      return replayOrReject(existing.get(), lab, code);
    }
    // Step 8
    Instant now = RequestReceivedAtFilter.receivedAt(request);
    if (now.isBefore(found.opensAt())) {
      throw new ApiException(ProblemType.LAB_NOT_OPEN, "The lab is not open for submissions yet.");
    }
    if (!now.isBefore(found.dueAt())) {
      throw new ApiException(ProblemType.LAB_CLOSED, "The deadline for this lab has passed.");
    }
    // Step 9
    var created =
        new SubmissionRepository.Stored(
            UUID.randomUUID(),
            lab,
            studentId,
            code,
            sizeOf(code),
            now.truncatedTo(ChronoUnit.MILLIS));
    if (repository.insertIfAbsent(created, key)) {
      return json(201, created, false);
    }
    // A concurrent request with the same key won; answer like a retry.
    return replayOrReject(repository.find(studentId, key).orElseThrow(), lab, code);
  }

  private ResponseEntity<byte[]> replayOrReject(
      SubmissionRepository.Stored stored, UUID lab, String code) {
    if (!stored.labId().equals(lab) || !stored.code().equals(code)) {
      throw new ApiException(
          ProblemType.IDEMPOTENCY_KEY_REUSED,
          "This Idempotency-Key was already used with a different lab or code.");
    }
    return json(200, stored, true);
  }

  private ResponseEntity<byte[]> json(
      int status, SubmissionRepository.Stored submission, boolean replay) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("id", submission.id());
    body.put("labId", submission.labId());
    body.put("studentId", submission.studentId());
    body.put("status", "queued");
    body.put("submittedAt", TIME.format(submission.submittedAt()));
    body.put("sizeBytes", submission.sizeBytes());
    ResponseEntity.BodyBuilder builder =
        ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON);
    if (replay) {
      builder.header("Idempotency-Replayed", "true");
    }
    return builder.body(problems.write(body));
  }

  private static int sizeOf(String code) {
    return code.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
  }
}
