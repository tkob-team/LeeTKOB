package com.leetkob.backend.classroom;

import com.leetkob.backend.problem.ApiException;
import com.leetkob.backend.problem.ProblemType;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Class management with database-backed global roles and class-scoped access. */
@Service
class ClassroomService {

  record Actor(UUID id, String role) {}

  record Classroom(UUID id, String name, String inviteCode) {}

  record Member(UUID id, String role) {}

  private static final SecureRandom RANDOM = new SecureRandom();
  private final JdbcClient jdbc;

  ClassroomService(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  Actor actor(Jwt jwt) {
    UUID id = UUID.fromString(jwt.getSubject());
    String role =
        jdbc.sql("select role from users where id = ?")
            .param(id)
            .query(String.class)
            .optional()
            .orElseThrow(() -> new ApiException(ProblemType.UNAUTHENTICATED, "User not found."));
    if (!role.equals(jwt.getClaimAsString("role"))) {
      throw new ApiException(ProblemType.UNAUTHENTICATED, "The user's role has changed.");
    }
    return new Actor(id, role);
  }

  @Transactional
  Classroom create(Actor actor, String name) {
    requireRole(actor, "ADMIN");
    if (name == null || name.isBlank() || name.strip().length() > 200) {
      throw invalid("name must contain 1 to 200 characters.");
    }
    byte[] bytes = new byte[24];
    RANDOM.nextBytes(bytes);
    var classroom =
        new Classroom(
            UUID.randomUUID(),
            name.strip(),
            Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
    jdbc.sql("insert into classes (id, name, invite_code) values (?, ?, ?)")
        .params(classroom.id(), classroom.name(), classroom.inviteCode())
        .update();
    return classroom;
  }

  @Transactional
  void assignTa(Actor actor, UUID classId, UUID userId) {
    requireRole(actor, "ADMIN");
    find(classId);
    String role =
        jdbc.sql("select role from users where id = ?")
            .param(userId)
            .query(String.class)
            .optional()
            .orElseThrow(() -> invalid("The TA user does not exist."));
    if (!"TA".equals(role)) {
      throw invalid("Only an existing TA account can be assigned.");
    }
    jdbc.sql("insert into class_tas (class_id, user_id) values (?, ?) on conflict do nothing")
        .params(classId, userId)
        .update();
  }

  @Transactional
  Classroom join(Actor actor, String inviteCode) {
    requireRole(actor, "STUDENT");
    if (inviteCode == null || !inviteCode.matches("[A-Za-z0-9_-]{32}")) {
      throw invalid("inviteCode must be a 32-character invitation code.");
    }
    Classroom classroom =
        jdbc.sql("select id, name, invite_code from classes where invite_code = ?")
            .param(inviteCode)
            .query((rs, row) ->
                new Classroom(rs.getObject("id", UUID.class), rs.getString("name"), null))
            .optional()
            .orElseThrow(ClassroomService::notFound);
    jdbc.sql("insert into class_members (class_id, user_id) values (?, ?) on conflict do nothing")
        .params(classroom.id(), actor.id())
        .update();
    return classroom;
  }

  List<Classroom> list(Actor actor) {
    return jdbc.sql(
            """
            select c.id, c.name, case when ? = 'STUDENT' then null else c.invite_code end as invite_code
            from classes c where ? = 'ADMIN'
              or (? = 'TA' and exists (select 1 from class_tas t where t.class_id = c.id and t.user_id = ?))
              or (? = 'STUDENT' and exists
                  (select 1 from class_members m where m.class_id = c.id and m.user_id = ?))
            order by c.name, c.id
            """)
        .params(actor.role(), actor.role(), actor.role(), actor.id(), actor.role(), actor.id())
        .query((rs, row) ->
            new Classroom(
                rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("invite_code")))
        .list();
  }

  Classroom detail(Actor actor, UUID classId) {
    requireAccess(actor, classId, false);
    Classroom found = find(classId);
    return new Classroom(
        found.id(), found.name(), "STUDENT".equals(actor.role()) ? null : found.inviteCode());
  }

  List<Member> members(Actor actor, UUID classId) {
    requireAccess(actor, classId, true);
    find(classId);
    return jdbc.sql(
            """
            select user_id, 'STUDENT' as role from class_members where class_id = ?
            union all select user_id, 'TA' as role from class_tas where class_id = ?
            order by role, user_id
            """)
        .params(classId, classId)
        .query((rs, row) -> new Member(rs.getObject("user_id", UUID.class), rs.getString("role")))
        .list();
  }

  private void requireAccess(Actor actor, UUID classId, boolean staffOnly) {
    if ("ADMIN".equals(actor.role())) {
      return;
    }
    if (staffOnly && !"TA".equals(actor.role())) {
      throw new ApiException(ProblemType.CLASS_ACCESS_DENIED, "Only class staff can list members.");
    }
    String sql =
        "TA".equals(actor.role())
            ? "select count(*) from class_tas where class_id = ? and user_id = ?"
            : "select count(*) from class_members where class_id = ? and user_id = ?";
    if (jdbc.sql(sql).params(classId, actor.id()).query(Integer.class).single() == 0) {
      throw notFound();
    }
  }

  private Classroom find(UUID classId) {
    return jdbc.sql("select id, name, invite_code from classes where id = ?")
        .param(classId)
        .query((rs, row) ->
            new Classroom(
                rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("invite_code")))
        .optional()
        .orElseThrow(ClassroomService::notFound);
  }

  private static void requireRole(Actor actor, String role) {
    if (!role.equals(actor.role())) {
      throw new ApiException(
          ProblemType.CLASS_ACCESS_DENIED, "This action requires role " + role + ".");
    }
  }

  private static ApiException invalid(String detail) {
    return new ApiException(ProblemType.INVALID_REQUEST, detail);
  }

  private static ApiException notFound() {
    return new ApiException(ProblemType.CLASS_NOT_FOUND, "Class or invitation not found.");
  }
}
