package com.leetkob.backend.classroom;

import com.leetkob.backend.problem.ApiException;
import com.leetkob.backend.problem.ProblemType;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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

  record TaAccount(UUID id, String email, String displayName) {}

  record AdminClass(
      UUID id, String name, String inviteCode, List<TaAccount> tas, int studentCount) {}

  record AdminMember(UUID id, String role, String email, String displayName) {}

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

  List<TaAccount> tas(Actor actor) {
    requireRole(actor, "ADMIN");
    return jdbc.sql(
            "select id, email, display_name from users where role = 'TA'"
                + " order by email nulls last, id")
        .query((rs, row) -> taAccount(rs))
        .list();
  }

  /** Every class with its TAs (by name) and student count, for the admin class list. */
  List<AdminClass> adminClasses(Actor actor) {
    requireRole(actor, "ADMIN");
    Map<UUID, List<TaAccount>> tas = new HashMap<>();
    jdbc.sql(
            """
            select t.class_id, u.id, u.email, u.display_name
            from class_tas t join users u on u.id = t.user_id
            order by u.display_name nulls last, u.email nulls last, u.id
            """)
        .query((ResultSet rs) -> {
          tas.computeIfAbsent(rs.getObject("class_id", UUID.class), k -> new ArrayList<>())
              .add(taAccount(rs));
        });
    return jdbc.sql(
            """
            select c.id, c.name, c.invite_code,
              (select count(*) from class_members m where m.class_id = c.id) as students
            from classes c order by c.name, c.id
            """)
        .query((rs, row) -> {
          UUID id = rs.getObject("id", UUID.class);
          return new AdminClass(
              id,
              rs.getString("name"),
              rs.getString("invite_code"),
              List.copyOf(tas.getOrDefault(id, List.of())),
              rs.getInt("students"));
        })
        .list();
  }

  /** Members of one class with email and name: TAs first, then by name; admin only. */
  List<AdminMember> adminMembers(Actor actor, UUID classId) {
    requireRole(actor, "ADMIN");
    find(classId);
    return jdbc.sql(
            """
            select u.id, m.role, u.email, u.display_name from (
              select user_id, 'TA' as role, 0 as rank from class_tas where class_id = ?
              union all
              select user_id, 'STUDENT' as role, 1 as rank from class_members where class_id = ?
            ) m join users u on u.id = m.user_id
            order by m.rank, u.display_name nulls last, u.email nulls last, u.id
            """)
        .params(classId, classId)
        .query((rs, row) ->
            new AdminMember(
                rs.getObject("id", UUID.class),
                rs.getString("role"),
                rs.getString("email"),
                rs.getString("display_name")))
        .list();
  }

  /** Removes a TA from a class; removing someone who is not a TA there is also a success. */
  @Transactional
  void removeTa(Actor actor, UUID classId, UUID userId) {
    requireRole(actor, "ADMIN");
    find(classId);
    jdbc.sql("delete from class_tas where class_id = ? and user_id = ?")
        .params(classId, userId)
        .update();
  }

  /**
   * Removes a student who has no submission in any lab of the class; with one, 409 and nothing
   * changes, so the review queue and grades never lose their student.
   */
  @Transactional
  void removeStudent(Actor actor, UUID classId, UUID userId) {
    requireRole(actor, "ADMIN");
    find(classId);
    boolean submitted =
        jdbc.sql(
                """
                select exists (select 1 from submissions s join labs l on l.id = s.lab_id
                               where l.class_id = ? and s.student_id = ?)
                """)
            .params(classId, userId)
            .query(Boolean.class)
            .single();
    if (submitted) {
      throw new ApiException(
          ProblemType.MEMBER_HAS_SUBMISSIONS, "The student has submissions in this class.");
    }
    jdbc.sql("delete from class_members where class_id = ? and user_id = ?")
        .params(classId, userId)
        .update();
  }

  private static TaAccount taAccount(ResultSet rs) throws SQLException {
    return new TaAccount(
        rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("display_name"));
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
