package com.leetkob.backend.lab;

import com.leetkob.backend.problem.ApiException;
import com.leetkob.backend.problem.ProblemType;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** Lab authoring endpoints, as specified in docs/contract/lab-authoring.md. */
@RestController
class LabController {

  private static final DateTimeFormatter TIME =
      DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);
  private static final Pattern UUID_FORMAT =
      Pattern.compile(
          "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");

  private record Actor(UUID id, String role) {}

  private final LabRepository repository;
  private final LabRequestParser parser;
  private final Clock clock;

  LabController(LabRepository repository, LabRequestParser parser, Clock clock) {
    this.repository = repository;
    this.parser = parser;
    this.clock = clock;
  }

  @PostMapping("/classes/{classId}/labs")
  ResponseEntity<Map<String, Object>> create(
      @PathVariable String classId, @AuthenticationPrincipal Jwt jwt, HttpServletRequest request)
      throws IOException {
    Actor actor = requireTa(jwt);
    UUID id = assignedClass(actor, classId);
    parser.checkContentType(request);
    LabRequestParser.NewLab lab = parser.parse(request);
    UUID labId = repository.insert(id, lab);
    LabRepository.Lab stored = repository.find(labId).orElseThrow();
    return ResponseEntity.created(URI.create("/labs/" + labId))
        .cacheControl(CacheControl.noStore())
        .body(view(stored, true));
  }

  @GetMapping("/classes/{classId}/labs")
  ResponseEntity<List<Map<String, Object>>> list(
      @PathVariable String classId, @AuthenticationPrincipal Jwt jwt) {
    UUID id = assignedClass(requireTa(jwt), classId);
    List<Map<String, Object>> labs =
        repository.list(id).stream()
            .map(s -> {
              Map<String, Object> item = new LinkedHashMap<>();
              item.put("id", s.id());
              item.put("title", s.title());
              item.put("opensAt", TIME.format(s.opensAt()));
              item.put("dueAt", TIME.format(s.dueAt()));
              item.put("cpuTimeMs", s.cpuTimeMs());
              item.put("memoryMb", s.memoryMb());
              item.put("testCount", s.testCount());
              item.put("constraintCount", s.constraintCount());
              item.put("submissionCount", s.submissionCount());
              item.put("studentsSubmitted", s.studentsSubmitted());
              return item;
            })
            .toList();
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(labs);
  }

  @GetMapping("/labs/{labId}")
  ResponseEntity<Map<String, Object>> lab(
      @PathVariable String labId, @AuthenticationPrincipal Jwt jwt) {
    Actor actor = actor(jwt);
    if (!"TA".equals(actor.role()) && !"STUDENT".equals(actor.role())) {
      throw new ApiException(
          ProblemType.FORBIDDEN_ROLE, "Only a TA or a student of the lab's class can read it.");
    }
    UUID id = uuid(labId, "labId");
    LabRepository.Lab lab =
        repository
            .find(id)
            .filter(l ->
                "TA".equals(actor.role())
                    ? repository.isTaOf(l.classId(), actor.id())
                    : repository.isMemberOf(l.classId(), actor.id()))
            .orElseThrow(() -> new ApiException(ProblemType.LAB_NOT_FOUND, "Lab not found."));
    boolean ta = "TA".equals(actor.role());
    if (!ta && Instant.now(clock).isBefore(lab.opensAt())) {
      throw new ApiException(ProblemType.LAB_NOT_OPEN, "The lab is not open yet.");
    }
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(view(lab, ta));
  }

  private Map<String, Object> view(LabRepository.Lab lab, boolean withTests) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("id", lab.id());
    body.put("classId", lab.classId());
    body.put("title", lab.title());
    body.put("statementMd", lab.statementMd());
    body.put("opensAt", TIME.format(lab.opensAt()));
    body.put("dueAt", TIME.format(lab.dueAt()));
    body.put("cpuTimeMs", lab.cpuTimeMs());
    body.put("wallTimeMs", 3 * lab.cpuTimeMs());
    body.put("memoryMb", lab.memoryMb());
    body.put("constraints", repository.constraints(lab.id()));
    if (withTests) {
      body.put("tests", repository.tests(lab.id()));
    }
    return body;
  }

  private Actor actor(Jwt jwt) {
    UUID id = UUID.fromString(jwt.getSubject());
    String role =
        repository
            .role(id)
            .orElseThrow(() ->
                new ApiException(ProblemType.UNAUTHENTICATED, "The token's user does not exist."));
    if (!role.equals(jwt.getClaimAsString("role"))) {
      throw new ApiException(ProblemType.UNAUTHENTICATED, "The user's role has changed.");
    }
    return new Actor(id, role);
  }

  private Actor requireTa(Jwt jwt) {
    Actor actor = actor(jwt);
    if (!"TA".equals(actor.role())) {
      throw new ApiException(
          ProblemType.FORBIDDEN_ROLE, "Only a TA of the class can author or list its labs.");
    }
    return actor;
  }

  private UUID assignedClass(Actor actor, String classId) {
    UUID id = uuid(classId, "classId");
    if (!repository.isTaOf(id, actor.id())) {
      throw new ApiException(ProblemType.CLASS_NOT_FOUND, "Class not found.");
    }
    return id;
  }

  private static UUID uuid(String value, String field) {
    if (!UUID_FORMAT.matcher(value).matches()) {
      throw new ApiException(
          ProblemType.INVALID_REQUEST,
          "The request is invalid.",
          List.of(new ApiException.FieldError(field, "Must be a UUID.")));
    }
    return UUID.fromString(value);
  }
}
