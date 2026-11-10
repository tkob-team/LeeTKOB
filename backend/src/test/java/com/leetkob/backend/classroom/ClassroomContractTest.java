package com.leetkob.backend.classroom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** HTTP and PostgreSQL integration tests for the T29 class API and its access boundaries. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ClassroomContractTest {

  @Autowired private MockMvc mvc;
  @Autowired private JdbcClient jdbc;
  @Autowired private JsonMapper json;

  private UUID admin;
  private UUID ta;
  private UUID student;

  @BeforeEach
  void seed() {
    jdbc.sql("truncate submissions, labs, class_members, class_tas, classes, users cascade")
        .update();
    admin = user("ADMIN");
    ta = user("TA");
    student = user("STUDENT");
  }

  @Test
  void administratorCreatesAndListsClasses() throws Exception {
    JsonNode created = create("  Advanced Web  ");
    assertThat(created.path("name").asText()).isEqualTo("Advanced Web");
    assertThat(created.path("inviteCode").asText()).matches("[A-Za-z0-9_-]{32}");
    call(get("/classes"), admin, "ADMIN")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].id").value(created.path("id").asText()));
    JsonNode second = create("Other class");
    assertThat(second.path("inviteCode").asText())
        .isNotEqualTo(created.path("inviteCode").asText());
  }

  @Test
  void onlyAdministratorsCanCreateClassesAndAssignTas() throws Exception {
    JsonNode created = create("Class");
    for (String role : List.of("TA", "STUDENT")) {
      UUID caller = "TA".equals(role) ? ta : student;
      call(
              post("/classes").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"X\"}"),
              caller,
              role)
          .andExpect(status().isForbidden());
      call(
              post("/classes/" + created.path("id").asText() + "/tas")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"userId\":\"" + ta + "\"}"),
              caller,
              role)
          .andExpect(status().isForbidden());
    }
  }

  @Test
  void assignmentIsIdempotentAndScopedToOneClass() throws Exception {
    JsonNode first = create("First");
    JsonNode second = create("Second");
    assign(first, ta).andExpect(status().isNoContent());
    assign(first, ta).andExpect(status().isNoContent());
    call(get("/classes"), ta, "TA")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].id").value(first.path("id").asText()));
    call(get("/classes/" + first.path("id").asText()), ta, "TA")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.inviteCode").isString());
    call(get("/classes/" + second.path("id").asText()), ta, "TA").andExpect(status().isNotFound());
    call(get("/classes/" + second.path("id").asText() + "/members"), ta, "TA")
        .andExpect(status().isNotFound());
    assertThat(count("class_tas")).isEqualTo(1);
  }

  @Test
  void onlyExistingTaAccountsCanBeAssigned() throws Exception {
    JsonNode created = create("Class");
    for (UUID target : List.of(student, admin, UUID.randomUUID())) {
      assign(created, target).andExpect(status().isBadRequest());
    }
    assertThat(count("class_tas")).isZero();
  }

  @Test
  void studentJoinsOnceAndCannotSeeInviteOrRoster() throws Exception {
    JsonNode created = create("Class");
    assign(created, ta).andExpect(status().isNoContent());
    join(created, student)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.inviteCode").doesNotExist());
    join(created, student).andExpect(status().isOk());
    assertThat(count("class_members")).isEqualTo(1);
    call(get("/classes"), student, "STUDENT")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].inviteCode").doesNotExist());
    call(get("/classes/" + created.path("id").asText()), student, "STUDENT")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.inviteCode").doesNotExist());
    call(get("/classes/" + created.path("id").asText() + "/members"), student, "STUDENT")
        .andExpect(status().isForbidden());
    call(get("/classes/" + created.path("id").asText() + "/members"), ta, "TA")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(2));
  }

  @Test
  void concurrentJoinsAreIdempotent() throws Exception {
    JsonNode created = create("Class");
    try (var pool = Executors.newFixedThreadPool(4)) {
      Callable<Integer> request =
          () -> join(created, student).andReturn().getResponse().getStatus();
      for (var result : pool.invokeAll(List.of(request, request, request, request))) {
        assertThat(result.get()).isEqualTo(200);
      }
    }
    assertThat(count("class_members")).isEqualTo(1);
  }

  @Test
  void outsiderAndMissingClassesAreHidden() throws Exception {
    JsonNode created = create("Class");
    for (String id : List.of(created.path("id").asText(), UUID.randomUUID().toString())) {
      call(get("/classes/" + id), student, "STUDENT").andExpect(status().isNotFound());
      call(get("/classes/" + id), ta, "TA").andExpect(status().isNotFound());
    }
    call(get("/classes"), student, "STUDENT").andExpect(jsonPath("$.length()").value(0));
  }

  @Test
  void invitationCannotChooseAnotherStudentOrGrantStaffPrivileges() throws Exception {
    JsonNode created = create("Class");
    UUID other = user("STUDENT");
    call(
            post("/classes/join")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"inviteCode\":\""
                        + created.path("inviteCode").asText()
                        + "\",\"userId\":\""
                        + other
                        + "\",\"role\":\"TA\"}"),
            student,
            "STUDENT")
        .andExpect(status().isOk());
    assertThat(jdbc.sql("select user_id from class_members").query(UUID.class).single())
        .isEqualTo(student);
    assertThat(count("class_tas")).isZero();
    for (String role : List.of("ADMIN", "TA")) {
      call(
              post("/classes/join")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"inviteCode\":\"" + created.path("inviteCode").asText() + "\"}"),
              "ADMIN".equals(role) ? admin : ta,
              role)
          .andExpect(status().isForbidden());
    }
  }

  @Test
  void invalidInputsAndUnknownInvitationsDoNotCreateRows() throws Exception {
    for (String name : List.of("", "   ", "x".repeat(201))) {
      call(
              post("/classes")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(json.writeValueAsString(new ClassroomController.CreateRequest(name))),
              admin,
              "ADMIN")
          .andExpect(status().isBadRequest());
    }
    call(post("/classes").contentType(MediaType.APPLICATION_JSON).content("{}"), admin, "ADMIN")
        .andExpect(status().isBadRequest());
    call(
            post("/classes/join").contentType(MediaType.APPLICATION_JSON).content("{}"),
            student,
            "STUDENT")
        .andExpect(status().isBadRequest());
    call(
            post("/classes/join")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"inviteCode\":\"" + "x".repeat(32) + "\"}"),
            student,
            "STUDENT")
        .andExpect(status().isNotFound());
    call(get("/classes/not-a-uuid"), admin, "ADMIN").andExpect(status().isBadRequest());
    assertThat(count("classes")).isZero();
    assertThat(count("class_members")).isZero();
  }

  @Test
  void authenticationAndPersistedRoleAreRequired() throws Exception {
    mvc.perform(get("/classes")).andExpect(status().isUnauthorized());
    call(get("/classes"), UUID.randomUUID(), "ADMIN").andExpect(status().isUnauthorized());
    call(get("/classes"), student, "ADMIN").andExpect(status().isUnauthorized());
    jdbc.sql("update users set role = 'STUDENT' where id = ?").param(ta).update();
    call(get("/classes"), ta, "TA").andExpect(status().isUnauthorized());
  }

  @Test
  void joinedStudentCanSubmitOnlyToJoinedClass() throws Exception {
    JsonNode created = create("Class");
    UUID lab = UUID.randomUUID();
    jdbc.sql(
            """
            insert into labs (id, class_id, opens_at, due_at)
            values (?, ?, now() - interval '1 hour', now() + interval '1 hour')
            """)
        .params(lab, UUID.fromString(created.path("id").asText()))
        .update();
    var request =
        post("/labs/" + lab + "/submissions")
            .header("Idempotency-Key", "class-join-test-key")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"code\":\"int main() {}\"}");
    call(request, student, "STUDENT").andExpect(status().isNotFound());
    join(created, student).andExpect(status().isOk());
    call(request, student, "STUDENT").andExpect(status().isCreated());
    call(request, user("STUDENT"), "STUDENT").andExpect(status().isNotFound());
  }

  @Test
  void unsupportedMethodsAdvertiseTheActualClassMethods() throws Exception {
    call(put("/classes"), admin, "ADMIN")
        .andExpect(status().isMethodNotAllowed())
        .andExpect(header().string("Allow", org.hamcrest.Matchers.containsString("GET")))
        .andExpect(header().string("Allow", org.hamcrest.Matchers.containsString("POST")));
  }

  private UUID user(String role) {
    UUID id = UUID.randomUUID();
    jdbc.sql("insert into users (id, role) values (?, ?)").params(id, role).update();
    return id;
  }

  private JsonNode create(String name) throws Exception {
    String body =
        call(
                post("/classes")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(new ClassroomController.CreateRequest(name))),
                admin,
                "ADMIN")
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return json.readTree(body);
  }

  private ResultActions assign(JsonNode classroom, UUID userId) throws Exception {
    return call(
        post("/classes/" + classroom.path("id").asText() + "/tas")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"userId\":\"" + userId + "\"}"),
        admin,
        "ADMIN");
  }

  private ResultActions join(JsonNode classroom, UUID userId) throws Exception {
    return call(
        post("/classes/join")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"inviteCode\":\"" + classroom.path("inviteCode").asText() + "\"}"),
        userId,
        "STUDENT");
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
    return mvc.perform(
        request.with(http -> {
          http.removeHeader("Authorization");
          http.addHeader("Authorization", "Bearer " + jwt.serialize());
          return http;
        }));
  }

  private int count(String table) {
    return jdbc.sql("select count(*) from " + table).query(Integer.class).single();
  }
}
