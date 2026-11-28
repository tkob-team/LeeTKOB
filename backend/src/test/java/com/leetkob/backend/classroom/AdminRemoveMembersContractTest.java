package com.leetkob.backend.classroom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * DELETE /admin/classes/{classId}/tas/{userId} and DELETE
 * /admin/classes/{classId}/students/{userId} (classes.md 1.3.0).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AdminRemoveMembersContractTest {

  @Autowired private MockMvc mvc;
  @Autowired private JdbcClient jdbc;

  private UUID admin;
  private UUID ta;
  private UUID student;
  private UUID web;
  private UUID lab;

  @BeforeEach
  void seed() {
    jdbc.sql("truncate submissions, labs, class_members, class_tas, classes, users cascade")
        .update();
    admin = user("ADMIN");
    ta = user("TA");
    student = user("STUDENT");
    web = UUID.randomUUID();
    jdbc.sql("insert into classes (id, name, invite_code) values (?, 'Web', ?)")
        .params(web, "W".repeat(32))
        .update();
    lab = UUID.randomUUID();
    jdbc.sql(
            """
            insert into labs (id, class_id, title, opens_at, due_at)
            values (?, ?, 'Lab 1', now() - interval '1 hour', now() + interval '1 hour')
            """)
        .params(lab, web)
        .update();
    jdbc.sql("insert into class_tas (class_id, user_id) values (?, ?)").params(web, ta).update();
    jdbc.sql("insert into class_members (class_id, user_id) values (?, ?)")
        .params(web, student)
        .update();
  }

  @Test
  void removedTaLosesAccessImmediatelyAndRepeatIsNoContent() throws Exception {
    call(get("/classes/" + web + "/labs"), ta, "TA").andExpect(status().isOk());
    call(get("/labs/" + lab + "/review-queue"), ta, "TA").andExpect(status().isOk());

    call(delete("/admin/classes/" + web + "/tas/" + ta), admin, "ADMIN")
        .andExpect(status().isNoContent());
    assertThat(count("class_tas")).isZero();

    call(get("/classes/" + web + "/labs"), ta, "TA").andExpect(status().isNotFound());
    call(get("/labs/" + lab + "/review-queue"), ta, "TA").andExpect(status().isNotFound());
    call(get("/classes"), ta, "TA")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(0));

    call(delete("/admin/classes/" + web + "/tas/" + ta), admin, "ADMIN")
        .andExpect(status().isNoContent());
    call(delete("/admin/classes/" + web + "/tas/" + UUID.randomUUID()), admin, "ADMIN")
        .andExpect(status().isNoContent());
  }

  @Test
  void studentWithoutSubmissionsIsRemovedAndLosesAccess() throws Exception {
    call(get("/student/labs"), student, "STUDENT")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1));

    call(delete("/admin/classes/" + web + "/students/" + student), admin, "ADMIN")
        .andExpect(status().isNoContent());
    assertThat(count("class_members")).isZero();

    call(get("/student/labs"), student, "STUDENT")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(0));
    call(
            post("/labs/" + lab + "/submissions")
                .header("Idempotency-Key", "removed-student-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"int main() {}\"}"),
            student,
            "STUDENT")
        .andExpect(status().isNotFound());
    assertThat(count("submissions")).isZero();

    call(delete("/admin/classes/" + web + "/students/" + student), admin, "ADMIN")
        .andExpect(status().isNoContent());
  }

  @Test
  void studentWithSubmissionsIsNotRemoved() throws Exception {
    call(
            post("/labs/" + lab + "/submissions")
                .header("Idempotency-Key", "kept-student-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"int main() {}\"}"),
            student,
            "STUDENT")
        .andExpect(status().isCreated());

    for (int attempt = 0; attempt < 2; attempt++) {
      call(delete("/admin/classes/" + web + "/students/" + student), admin, "ADMIN")
          .andExpect(status().isConflict())
          .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
          .andExpect(jsonPath("$.type").value("urn:leetkob:problem:member-has-submissions"))
          .andExpect(jsonPath("$.status").value(409));
    }
    assertThat(count("class_members")).isEqualTo(1);
    call(get("/student/labs"), student, "STUDENT").andExpect(jsonPath("$.length()").value(1));
  }

  @Test
  void submissionsInAnotherClassDoNotBlockRemoval() throws Exception {
    UUID other = UUID.randomUUID();
    jdbc.sql("insert into classes (id, name, invite_code) values (?, 'Other', ?)")
        .params(other, "O".repeat(32))
        .update();
    UUID otherLab = UUID.randomUUID();
    jdbc.sql(
            """
            insert into labs (id, class_id, title, opens_at, due_at)
            values (?, ?, 'Other lab', now() - interval '1 hour', now() + interval '1 hour')
            """)
        .params(otherLab, other)
        .update();
    jdbc.sql("insert into class_members (class_id, user_id) values (?, ?)")
        .params(other, student)
        .update();
    call(
            post("/labs/" + otherLab + "/submissions")
                .header("Idempotency-Key", "other-class-key-01")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"int main() {}\"}"),
            student,
            "STUDENT")
        .andExpect(status().isCreated());

    call(delete("/admin/classes/" + web + "/students/" + student), admin, "ADMIN")
        .andExpect(status().isNoContent());
    call(get("/student/labs"), student, "STUDENT")
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].id").value(otherLab.toString()));
  }

  @Test
  void unknownClassIs404AndMalformedIdsAre400() throws Exception {
    for (String kind : List.of("tas", "students")) {
      call(delete("/admin/classes/" + UUID.randomUUID() + "/" + kind + "/" + ta), admin, "ADMIN")
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.type").value("urn:leetkob:problem:class-not-found"));
      call(delete("/admin/classes/" + web + "/" + kind + "/not-a-uuid"), admin, "ADMIN")
          .andExpect(status().isBadRequest());
    }
    assertThat(count("class_tas")).isEqualTo(1);
    assertThat(count("class_members")).isEqualTo(1);
  }

  @Test
  void onlyAdministratorsMayRemoveMembers() throws Exception {
    for (String path :
        List.of(
            "/admin/classes/" + web + "/tas/" + ta,
            "/admin/classes/" + web + "/students/" + student)) {
      call(delete(path), ta, "TA")
          .andExpect(status().isForbidden())
          .andExpect(jsonPath("$.type").value("urn:leetkob:problem:class-access-denied"));
      call(delete(path), student, "STUDENT")
          .andExpect(status().isForbidden())
          .andExpect(jsonPath("$.type").value("urn:leetkob:problem:class-access-denied"));
      mvc.perform(delete(path)).andExpect(status().isUnauthorized());
    }
    assertThat(count("class_tas")).isEqualTo(1);
    assertThat(count("class_members")).isEqualTo(1);
  }

  private UUID user(String role) {
    UUID id = UUID.randomUUID();
    jdbc.sql("insert into users (id, role) values (?, ?)").params(id, role).update();
    return id;
  }

  private int count(String table) {
    return jdbc.sql("select count(*) from " + table).query(Integer.class).single();
  }

  private ResultActions call(MockHttpServletRequestBuilder request, UUID user, String role)
      throws Exception {
    var jwt =
        new SignedJWT(
            new JWSHeader(JWSAlgorithm.HS256),
            new JWTClaimsSet.Builder()
                .subject(user.toString())
                .claim("role", role)
                .expirationTime(Date.from(Instant.now().plusSeconds(300)))
                .build());
    jwt.sign(new MACSigner(TestcontainersConfiguration.JWT_SECRET));
    return mvc.perform(request.header("Authorization", "Bearer " + jwt.serialize()));
  }
}
