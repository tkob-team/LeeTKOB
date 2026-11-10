package com.leetkob.backend.classroom;

import com.leetkob.backend.problem.ApiException;
import com.leetkob.backend.problem.ProblemType;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Class API; the caller identity always comes from the verified JWT. */
@RestController
class ClassroomController {

  record CreateRequest(String name) {}

  record AssignRequest(String userId) {}

  record JoinRequest(String inviteCode) {}

  private final ClassroomService service;

  ClassroomController(ClassroomService service) {
    this.service = service;
  }

  @PostMapping("/classes")
  @ResponseStatus(HttpStatus.CREATED)
  ClassroomService.Classroom create(
      @AuthenticationPrincipal Jwt jwt, @RequestBody CreateRequest request) {
    return service.create(service.actor(jwt), request.name());
  }

  @GetMapping("/classes")
  List<ClassroomService.Classroom> list(@AuthenticationPrincipal Jwt jwt) {
    return service.list(service.actor(jwt));
  }

  @GetMapping("/classes/{classId}")
  ClassroomService.Classroom detail(
      @AuthenticationPrincipal Jwt jwt, @PathVariable String classId) {
    return service.detail(service.actor(jwt), id(classId));
  }

  @PostMapping("/classes/{classId}/tas")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void assign(
      @AuthenticationPrincipal Jwt jwt,
      @PathVariable String classId,
      @RequestBody AssignRequest request) {
    service.assignTa(service.actor(jwt), id(classId), id(request.userId()));
  }

  @PostMapping("/classes/join")
  ClassroomService.Classroom join(
      @AuthenticationPrincipal Jwt jwt, @RequestBody JoinRequest request) {
    return service.join(service.actor(jwt), request.inviteCode());
  }

  @GetMapping("/classes/{classId}/members")
  List<ClassroomService.Member> members(
      @AuthenticationPrincipal Jwt jwt, @PathVariable String classId) {
    return service.members(service.actor(jwt), id(classId));
  }

  private static UUID id(String value) {
    try {
      return UUID.fromString(value);
    } catch (IllegalArgumentException | NullPointerException exception) {
      throw new ApiException(ProblemType.INVALID_REQUEST, "A valid UUID is required.");
    }
  }
}
