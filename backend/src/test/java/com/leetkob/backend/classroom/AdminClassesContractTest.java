package com.leetkob.backend.classroom;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.leetkob.backend.TestcontainersConfiguration;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * GET /admin/classes and GET /admin/classes/{classId}/members (classes.md 1.2.0), plus the
 * displayName added to GET /admin/tas and the unchanged TA roster GET /classes/{id}/members.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AdminClassesContractTest {

  @Autowired private MockMvc mvc;
  @Autowired private JdbcClient jdbc;

  private UUID admin;
  private UUID taAnna;
  private UUID taBinh;
  private UUID studentChi;
  private UUID studentAn;
  private UUID web;
  private UUID algo;

  @BeforeEach
  void seed() {
    jdbc.sql("truncate submissions, labs, class_members, class_tas, classes, users cascade")
        .update();
    admin = user("ADMIN", "admin@truong.edu.vn", "Quản trị");
    taAnna = user("TA", "anna.ta@truong.edu.vn", "Anna Trợ giảng");
    taBinh = user("TA", "binh.ta@truong.edu.vn", "Bình Trợ giảng");
    studentChi = user("STUDENT", "chi@truong.edu.vn", "Chi");
    studentAn = user("STUDENT", "an@truong.edu.vn", "An");
    web = classroom("Web nâng cao", "W".repeat(32));
    algo = classroom("Algorithms", "A".repeat(32));
    jdbc.sql("insert into class_tas (class_id, user_id) values (?, ?), (?, ?)")
        .params(web, taBinh, web, taAnna)
        .update();
    jdbc.sql("insert into class_members (class_id, user_id) values (?, ?), (?, ?)")
        .params(web, studentChi, web, studentAn)
        .update();
  }

  @Test
  void adminClassListHasTasWithNamesAndStudentCountInOneCall() throws Exception {
    call("/admin/classes", admin, "ADMIN")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(2))
        .andExpect(jsonPath("$[0].id").value(algo.toString()))
        .andExpect(jsonPath("$[0].name").value("Algorithms"))
        .andExpect(jsonPath("$[0].inviteCode").value("A".repeat(32)))
        .andExpect(jsonPath("$[0].tas.length()").value(0))
        .andExpect(jsonPath("$[0].studentCount").value(0))
        .andExpect(jsonPath("$[1].id").value(web.toString()))
        .andExpect(jsonPath("$[1].inviteCode").value("W".repeat(32)))
        .andExpect(jsonPath("$[1].studentCount").value(2))
        .andExpect(jsonPath("$[1].tas.length()").value(2))
        .andExpect(jsonPath("$[1].tas[0].id").value(taAnna.toString()))
        .andExpect(jsonPath("$[1].tas[0].email").value("anna.ta@truong.edu.vn"))
        .andExpect(jsonPath("$[1].tas[0].displayName").value("Anna Trợ giảng"))
        .andExpect(jsonPath("$[1].tas[1].displayName").value("Bình Trợ giảng"))
        .andExpect(jsonPath("$[1].tas[0].role").doesNotExist());
  }

  @Test
  void adminMembersListTasFirstThenByNameWithEmailAndName() throws Exception {
    call("/admin/classes/" + web + "/members", admin, "ADMIN")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(4))
        .andExpect(jsonPath("$[0].id").value(taAnna.toString()))
        .andExpect(jsonPath("$[0].role").value("TA"))
        .andExpect(jsonPath("$[0].email").value("anna.ta@truong.edu.vn"))
        .andExpect(jsonPath("$[0].displayName").value("Anna Trợ giảng"))
        .andExpect(jsonPath("$[1].id").value(taBinh.toString()))
        .andExpect(jsonPath("$[1].role").value("TA"))
        .andExpect(jsonPath("$[2].id").value(studentAn.toString()))
        .andExpect(jsonPath("$[2].role").value("STUDENT"))
        .andExpect(jsonPath("$[2].displayName").value("An"))
        .andExpect(jsonPath("$[3].id").value(studentChi.toString()))
        .andExpect(jsonPath("$[3].email").value("chi@truong.edu.vn"));
    call("/admin/classes/" + algo + "/members", admin, "ADMIN")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(0));
  }

  @Test
  void unknownClassIs404AndMalformedIdIs400() throws Exception {
    call("/admin/classes/" + UUID.randomUUID() + "/members", admin, "ADMIN")
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:class-not-found"));
    call("/admin/classes/not-a-uuid/members", admin, "ADMIN")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:invalid-request"));
  }

  @Test
  void adminTaListIncludesDisplayName() throws Exception {
    call("/admin/tas", admin, "ADMIN")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(2))
        .andExpect(jsonPath("$[0].email").value("anna.ta@truong.edu.vn"))
        .andExpect(jsonPath("$[0].displayName").value("Anna Trợ giảng"))
        .andExpect(jsonPath("$[1].displayName").value("Bình Trợ giảng"));
  }

  @Test
  void onlyAdministratorsMayUseTheAdminEndpoints() throws Exception {
    for (String path : List.of("/admin/classes", "/admin/classes/" + web + "/members")) {
      call(path, taAnna, "TA")
          .andExpect(status().isForbidden())
          .andExpect(jsonPath("$.type").value("urn:leetkob:problem:class-access-denied"));
      call(path, studentChi, "STUDENT")
          .andExpect(status().isForbidden())
          .andExpect(jsonPath("$.type").value("urn:leetkob:problem:class-access-denied"));
      mvc.perform(get(path)).andExpect(status().isUnauthorized());
      call(path, UUID.randomUUID(), "ADMIN").andExpect(status().isUnauthorized());
    }
  }

  @Test
  void taRosterStaysAnonymousWithIdAndRoleOnly() throws Exception {
    call("/classes/" + web + "/members", taAnna, "TA")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(4))
        .andExpect(jsonPath("$[0].id").exists())
        .andExpect(jsonPath("$[0].role").exists())
        .andExpect(jsonPath("$[*].email").doesNotExist())
        .andExpect(jsonPath("$[*].displayName").doesNotExist());
  }

  private UUID user(String role, String email, String displayName) {
    UUID id = UUID.randomUUID();
    jdbc.sql("insert into users (id, role, email, display_name) values (?, ?, ?, ?)")
        .params(id, role, email, displayName)
        .update();
    return id;
  }

  private UUID classroom(String name, String inviteCode) {
    UUID id = UUID.randomUUID();
    jdbc.sql("insert into classes (id, name, invite_code) values (?, ?, ?)")
        .params(id, name, inviteCode)
        .update();
    return id;
  }

  private ResultActions call(String path, UUID user, String role) throws Exception {
    var jwt =
        new SignedJWT(
            new JWSHeader(JWSAlgorithm.HS256),
            new JWTClaimsSet.Builder()
                .subject(user.toString())
                .claim("role", role)
                .expirationTime(Date.from(Instant.now().plusSeconds(300)))
                .build());
    jwt.sign(new MACSigner(TestcontainersConfiguration.JWT_SECRET));
    return mvc.perform(get(path).header("Authorization", "Bearer " + jwt.serialize()));
  }
}
