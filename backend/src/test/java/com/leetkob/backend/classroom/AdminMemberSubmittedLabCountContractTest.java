package com.leetkob.backend.classroom;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

/** {@code submittedLabCount} on GET /admin/classes/{classId}/members (classes.md 1.5.0). */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AdminMemberSubmittedLabCountContractTest {

  @Autowired private MockMvc mvc;
  @Autowired private JdbcClient jdbc;

  private UUID admin;
  private UUID ta;
  private UUID studentAn;
  private UUID studentBinh;
  private UUID web;
  private UUID other;

  @BeforeEach
  void seed() {
    jdbc.sql("truncate submissions, labs, class_members, class_tas, classes, users cascade")
        .update();
    admin = user("ADMIN", "Quản trị");
    ta = user("TA", "Anna");
    studentAn = user("STUDENT", "An");
    studentBinh = user("STUDENT", "Bình");
    web = classroom("Web", "W");
    other = classroom("Other", "O");
    jdbc.sql("insert into class_tas (class_id, user_id) values (?, ?)").params(web, ta).update();
    jdbc.sql("insert into class_members (class_id, user_id) values (?, ?), (?, ?), (?, ?)")
        .params(web, studentAn, web, studentBinh, other, studentAn)
        .update();
  }

  @Test
  void countsTheDistinctLabsEachStudentSubmittedToInThisClassOnly() throws Exception {
    lab(web, "Lab 3");
    UUID lab1 = lab(web, "Lab 1");
    submit(lab1, studentAn, "labs-an-lab1-key-a");
    submit(lab1, studentAn, "labs-an-lab1-key-b");
    UUID lab2 = lab(web, "Lab 2");
    submit(lab2, studentAn, "labs-an-lab2-key-a");
    UUID otherLab = lab(other, "Other lab");
    submit(otherLab, studentAn, "labs-an-other-key-a");

    call("/admin/classes/" + web + "/members")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(3))
        .andExpect(jsonPath("$[0].id").value(ta.toString()))
        .andExpect(jsonPath("$[0].submittedLabCount").value(0))
        .andExpect(jsonPath("$[1].id").value(studentAn.toString()))
        .andExpect(jsonPath("$[1].submittedLabCount").value(2))
        .andExpect(jsonPath("$[1].submissionCount").value(3))
        .andExpect(jsonPath("$[2].id").value(studentBinh.toString()))
        .andExpect(jsonPath("$[2].submittedLabCount").value(0))
        .andExpect(jsonPath("$[2].submissionCount").value(0));

    call("/admin/classes/" + other + "/members")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].submittedLabCount").value(1))
        .andExpect(jsonPath("$[0].submissionCount").value(1));
  }

  @Test
  void classWithoutLabsReportsZeroLabsForEveryone() throws Exception {
    call("/admin/classes/" + web + "/members")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].submittedLabCount").value(0))
        .andExpect(jsonPath("$[1].submittedLabCount").value(0))
        .andExpect(jsonPath("$[2].submittedLabCount").value(0));
  }

  @Test
  void taRosterHasNoLabCount() throws Exception {
    lab(web, "Lab 1");
    callAs(get("/classes/" + web + "/members"), ta, "TA")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[1].submittedLabCount").doesNotExist());
  }

  private UUID user(String role, String name) {
    UUID id = UUID.randomUUID();
    jdbc.sql("insert into users (id, role, display_name) values (?, ?, ?)")
        .params(id, role, name)
        .update();
    return id;
  }

  private UUID classroom(String name, String codeLetter) {
    UUID id = UUID.randomUUID();
    jdbc.sql("insert into classes (id, name, invite_code) values (?, ?, ?)")
        .params(id, name, codeLetter.repeat(32))
        .update();
    return id;
  }

  private UUID lab(UUID classId, String title) {
    UUID id = UUID.randomUUID();
    jdbc.sql(
            """
            insert into labs (id, class_id, title, opens_at, due_at)
            values (?, ?, ?, now() - interval '1 hour', now() + interval '1 hour')
            """)
        .params(id, classId, title)
        .update();
    return id;
  }

  private void submit(UUID lab, UUID student, String key) throws Exception {
    callAs(
            post("/labs/" + lab + "/submissions")
                .header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"int main() {}\"}"),
            student,
            "STUDENT")
        .andExpect(status().isCreated());
  }

  private ResultActions call(String path) throws Exception {
    return callAs(get(path), admin, "ADMIN");
  }

  private ResultActions callAs(MockHttpServletRequestBuilder request, UUID user, String role)
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
