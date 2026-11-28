package com.leetkob.backend.classroom;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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

/** GET /admin/tas (classes.md 1.1.0): the TA accounts an administrator can assign. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AdminTasContractTest {

  @Autowired private MockMvc mvc;
  @Autowired private JdbcClient jdbc;

  private UUID admin;

  @BeforeEach
  void seed() {
    jdbc.sql("truncate submissions, labs, class_members, class_tas, classes, users cascade")
        .update();
    admin = user("ADMIN", "admin@truong.edu.vn");
  }

  @Test
  void administratorListsOnlyTaAccountsSortedByEmail() throws Exception {
    UUID zed = user("TA", "zed.ta@truong.edu.vn");
    UUID anna = user("TA", "anna.ta@truong.edu.vn");
    user("STUDENT", "aaa.student@truong.edu.vn");
    call(admin, "ADMIN")
        .andExpect(status().isOk())
        .andExpect(content().contentTypeCompatibleWith("application/json"))
        .andExpect(jsonPath("$.length()").value(2))
        .andExpect(jsonPath("$[0].id").value(anna.toString()))
        .andExpect(jsonPath("$[0].email").value("anna.ta@truong.edu.vn"))
        .andExpect(jsonPath("$[1].id").value(zed.toString()))
        .andExpect(jsonPath("$[1].email").value("zed.ta@truong.edu.vn"))
        .andExpect(jsonPath("$[0].role").doesNotExist())
        .andExpect(jsonPath("$[0].passwordHash").doesNotExist());
  }

  @Test
  void emptyListWhenThereAreNoTas() throws Exception {
    call(admin, "ADMIN").andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
  }

  @Test
  void taAndStudentAreForbidden() throws Exception {
    UUID ta = user("TA", "ta@truong.edu.vn");
    UUID student = user("STUDENT", "sv@truong.edu.vn");
    call(ta, "TA")
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:class-access-denied"));
    call(student, "STUDENT")
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:class-access-denied"));
  }

  @Test
  void missingTokenOrChangedRoleIsUnauthenticated() throws Exception {
    mvc.perform(get("/admin/tas")).andExpect(status().isUnauthorized());
    call(UUID.randomUUID(), "ADMIN").andExpect(status().isUnauthorized());
    UUID demoted = user("TA", "demoted@truong.edu.vn");
    call(demoted, "ADMIN").andExpect(status().isUnauthorized());
  }

  private UUID user(String role, String email) {
    UUID id = UUID.randomUUID();
    jdbc.sql("insert into users (id, role, email) values (?, ?, ?)")
        .params(id, role, email)
        .update();
    return id;
  }

  private ResultActions call(UUID user, String role) throws Exception {
    var jwt =
        new SignedJWT(
            new JWSHeader(JWSAlgorithm.HS256),
            new JWTClaimsSet.Builder()
                .subject(user.toString())
                .claim("role", role)
                .expirationTime(Date.from(Instant.now().plusSeconds(300)))
                .build());
    jwt.sign(new MACSigner(TestcontainersConfiguration.JWT_SECRET));
    return mvc.perform(get("/admin/tas").header("Authorization", "Bearer " + jwt.serialize()));
  }
}
