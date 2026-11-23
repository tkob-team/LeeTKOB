package com.leetkob.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.leetkob.backend.TestcontainersConfiguration;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** {@code POST /auth/login}, as specified in docs/contract/post-auth-login.md. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AuthLoginContractTest {

  private static final String PATH = "/auth/login";
  private static final String PASSWORD = "correct horse battery staple";
  private static final String ADDRESS = "10.0.0.1";

  @Autowired private JdbcClient jdbc;
  @Autowired private MockMvc mvc;
  @Autowired private JwtDecoder decoder;
  @Autowired private JsonMapper json;
  @Autowired private LoginAttempts attempts;

  private UUID ta;
  private UUID student;
  private UUID lab;

  @BeforeEach
  void seed() {
    attempts.clear();
    jdbc.sql(
            "truncate model_calls, submissions, labs, class_members, class_tas, classes, users"
                + " cascade")
        .update();
    String hash = new BCryptPasswordEncoder().encode(PASSWORD);
    ta = user("ta01@truong.edu.vn", hash, "TA", "Thay Ta");
    student = user("sv01@truong.edu.vn", hash, "STUDENT", null);
    user("nopassword@truong.edu.vn", null, "STUDENT", "No Password");
    final UUID classId = UUID.randomUUID();
    jdbc.sql("insert into classes (id, name) values (?, 'Home')").params(classId).update();
    jdbc.sql("insert into class_tas values (?, ?)").params(classId, ta).update();
    jdbc.sql("insert into class_members values (?, ?)").params(classId, student).update();
    lab = UUID.randomUUID();
    jdbc.sql(
            """
            insert into labs (id, class_id, title, opens_at, due_at)
            values (?, ?, 'Sort', now() - interval '1 day', now() + interval '1 day')
            """)
        .params(lab, classId)
        .update();
  }

  @Test
  void correctPasswordIssuesVerifiableToken() throws Exception {
    String body =
        login(" TA01@truong.edu.vn ", PASSWORD, ADDRESS)
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.role").value("TA"))
            .andExpect(jsonPath("$.displayName").value("Thay Ta"))
            .andExpect(jsonPath("$.token").isString())
            .andReturn()
            .getResponse()
            .getContentAsString();

    Jwt jwt = decoder.decode(json.readTree(body).get("token").stringValue());
    assertThat(jwt.getHeaders()).containsEntry("alg", "HS256");
    assertThat(jwt.getSubject()).isEqualTo(ta.toString());
    assertThat(jwt.getClaimAsString("role")).isEqualTo("TA");
    assertThat(jwt.getIssuedAt()).isNotNull();
    assertThat(Duration.between(jwt.getIssuedAt(), jwt.getExpiresAt()))
        .isEqualTo(Duration.ofHours(8));

    login("sv01@truong.edu.vn", PASSWORD, ADDRESS)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.role").value("STUDENT"))
        .andExpect(jsonPath("$.displayName").isEmpty());
  }

  @Test
  void wrongPasswordIsRejected() throws Exception {
    login("ta01@truong.edu.vn", "wrong password", ADDRESS)
        .andExpect(status().isUnauthorized())
        .andExpect(header().doesNotExist("WWW-Authenticate"))
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:invalid-credentials"))
        .andExpect(jsonPath("$.token").doesNotHaveJsonPath());
  }

  @Test
  void unknownEmailGetsTheSameResponseAsWrongPassword() throws Exception {
    JsonNode wrongPassword = problem(login("ta01@truong.edu.vn", "wrong", ADDRESS));
    JsonNode unknownEmail = problem(login("nobody@truong.edu.vn", PASSWORD, ADDRESS));
    JsonNode noPassword = problem(login("nopassword@truong.edu.vn", PASSWORD, ADDRESS));

    assertThat(wrongPassword.get("status").intValue()).isEqualTo(401);
    assertThat(unknownEmail).isEqualTo(wrongPassword);
    assertThat(noPassword).isEqualTo(wrongPassword);
  }

  @Test
  void issuedTokenCallsExistingEndpointsByRole() throws Exception {
    String taToken = token("ta01@truong.edu.vn");
    String studentToken = token("sv01@truong.edu.vn");

    mvc.perform(get("/labs/{lab}/review-queue", lab).header("Authorization", "Bearer " + taToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.labId").value(lab.toString()));
    mvc.perform(
            get("/labs/{lab}/review-queue", lab).header("Authorization", "Bearer " + studentToken))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:forbidden-role"));
    mvc.perform(get("/student/labs").header("Authorization", "Bearer " + studentToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value(lab.toString()));
    mvc.perform(get("/student/labs").header("Authorization", "Bearer " + taToken))
        .andExpect(status().isForbidden());
  }

  @Test
  void repeatedFailuresForAnEmailAreLimited() throws Exception {
    for (int i = 0; i < 5; i++) {
      login("ta01@truong.edu.vn", "wrong " + i, "10.0.0." + (i + 10))
          .andExpect(status().isUnauthorized());
    }
    login("ta01@truong.edu.vn", PASSWORD, "10.0.0.99")
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"))
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:too-many-attempts"));
    login("sv01@truong.edu.vn", PASSWORD, "10.0.0.99").andExpect(status().isOk());
  }

  @Test
  void repeatedFailuresFromAnAddressAreLimited() throws Exception {
    for (int i = 0; i < 20; i++) {
      login("user" + i + "@truong.edu.vn", "wrong", ADDRESS).andExpect(status().isUnauthorized());
    }
    login("ta01@truong.edu.vn", PASSWORD, ADDRESS)
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"))
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:too-many-attempts"));
    login("ta01@truong.edu.vn", PASSWORD, "10.0.0.2").andExpect(status().isOk());
  }

  @Test
  void invalidBodyIsRejected() throws Exception {
    send("{\"email\": \"ta01@truong.edu.vn\"}", MediaType.APPLICATION_JSON_VALUE)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:invalid-request"))
        .andExpect(jsonPath("$.errors[0].field").value("password"));
    send("{\"email\": \"  \", \"password\": \"x\"}", MediaType.APPLICATION_JSON_VALUE)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("email"));
    send("{\"email\": \"a@b\", \"password\": \"x\", \"role\": \"TA\"}", "application/json")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("body"));
    send("not json", MediaType.APPLICATION_JSON_VALUE).andExpect(status().isBadRequest());
    send("{\"email\": \"a@b\", \"password\": \"" + "x".repeat(73) + "\"}", "application/json")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("password"));
    send("email=a@b&password=x", MediaType.APPLICATION_FORM_URLENCODED_VALUE)
        .andExpect(status().isUnsupportedMediaType())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:unsupported-media-type"));
  }

  @Test
  void otherMethodsAreNotAllowed() throws Exception {
    mvc.perform(get(PATH))
        .andExpect(status().isMethodNotAllowed())
        .andExpect(header().string("Allow", "POST"))
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:method-not-allowed"));
  }

  private String token(String email) throws Exception {
    String body =
        login(email, PASSWORD, ADDRESS)
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return json.readTree(body).get("token").stringValue();
  }

  private JsonNode problem(ResultActions result) throws Exception {
    return json.readTree(result.andReturn().getResponse().getContentAsString());
  }

  private ResultActions login(String email, String password, String address) throws Exception {
    String body = json.writeValueAsString(Map.of("email", email, "password", password));
    return mvc.perform(
        post(PATH)
            .contentType(MediaType.APPLICATION_JSON)
            .content(body)
            .with(request -> {
              request.setRemoteAddr(address);
              return request;
            }));
  }

  private ResultActions send(String body, String contentType) throws Exception {
    return mvc.perform(post(PATH).contentType(contentType).content(body));
  }

  private UUID user(String email, String hash, String role, String displayName) {
    UUID id = UUID.randomUUID();
    jdbc.sql(
            "insert into users (id, email, password_hash, role, display_name) values (?, ?, ?, ?,"
                + " ?)")
        .params(id, email, hash, role, displayName)
        .update();
    return id;
  }
}
