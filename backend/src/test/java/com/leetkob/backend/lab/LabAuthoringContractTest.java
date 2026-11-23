package com.leetkob.backend.lab;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.leetkob.backend.TestcontainersConfiguration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.json.JsonMapper;

/** Lab authoring endpoints, as specified in docs/contract/lab-authoring.md. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class LabAuthoringContractTest {

  private static final String CLASS_LABS = "/classes/{classId}/labs";
  private static final String LAB = "/labs/{labId}";

  @Autowired private JdbcClient jdbc;
  @Autowired private MockMvc mvc;
  @Autowired private JsonMapper json;

  private UUID ta;
  private UUID otherTa;
  private UUID admin;
  private UUID alice;
  private UUID outsider;
  private UUID classId;
  private UUID otherClass;

  @BeforeEach
  void seed() {
    jdbc.sql(
            "truncate model_calls, submissions, labs, class_members, class_tas, classes, users"
                + " cascade")
        .update();
    ta = user("TA");
    otherTa = user("TA");
    admin = user("ADMIN");
    alice = user("STUDENT");
    outsider = user("STUDENT");
    classId = UUID.randomUUID();
    otherClass = UUID.randomUUID();
    jdbc.sql("insert into classes (id, name) values (?, 'Home'), (?, 'Other')")
        .params(classId, otherClass)
        .update();
    jdbc.sql("insert into class_tas values (?, ?), (?, ?)")
        .params(classId, ta, otherClass, otherTa)
        .update();
    jdbc.sql("insert into class_members values (?, ?), (?, ?)")
        .params(classId, alice, otherClass, outsider)
        .update();
  }

  @Test
  void assignedTaCreatesLabWithTestsAndConstraints() throws Exception {
    Map<String, Object> body = body();
    body.put("cpuTimeMs", 2000);
    body.put("memoryMb", 128);
    body.put("title", "  Sorting with merge sort  ");

    String location =
        create(ta, body)
            .andExpect(status().isCreated())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.classId").value(classId.toString()))
            .andExpect(jsonPath("$.title").value("Sorting with merge sort"))
            .andExpect(jsonPath("$.statementMd").value("# Sort\n\nRead `n` integers."))
            .andExpect(jsonPath("$.opensAt").value("2026-11-24T01:00:00.000Z"))
            .andExpect(jsonPath("$.dueAt").value("2026-12-01T16:59:59.000Z"))
            .andExpect(jsonPath("$.cpuTimeMs").value(2000))
            .andExpect(jsonPath("$.wallTimeMs").value(6000))
            .andExpect(jsonPath("$.memoryMb").value(128))
            .andExpect(jsonPath("$.constraints.length()").value(2))
            .andExpect(jsonPath("$.constraints[0].code").value("C1"))
            .andExpect(jsonPath("$.constraints[0].deduction").value(3.0))
            .andExpect(jsonPath("$.constraints[1].code").value("C2"))
            .andExpect(jsonPath("$.constraints[1].deduction").value(4.5))
            .andExpect(jsonPath("$.tests.length()").value(2))
            .andExpect(jsonPath("$.tests[0].ordinal").value(1))
            .andExpect(jsonPath("$.tests[0].input").value("3\n3 1 2\n"))
            .andExpect(jsonPath("$.tests[1].expectedOutput").value("5\n"))
            .andReturn()
            .getResponse()
            .getHeader("Location");

    assertThat(location).startsWith("/labs/");
    UUID lab = UUID.fromString(location.substring("/labs/".length()));
    assertThat(
            jdbc.sql("select title, cpu_time_ms, memory_mb from labs where id = ? and class_id = ?")
                .params(lab, classId)
                .query((rs, n) -> rs.getString(1) + "/" + rs.getInt(2) + "/" + rs.getInt(3))
                .single())
        .isEqualTo("Sorting with merge sort/2000/128");
    assertThat(
            jdbc.sql(
                    "select ordinal || ':' || expected_output from lab_tests where lab_id = ?"
                        + " order by ordinal")
                .param(lab)
                .query(String.class)
                .list())
        .containsExactly("1:1 2 3\n", "2:5\n");
    assertThat(
            jdbc.sql(
                    "select code || '@' || ordinal || '=' || deduction from lab_constraints"
                        + " where lab_id = ? order by ordinal")
                .param(lab)
                .query(String.class)
                .list())
        .containsExactly("C1@1=3.00", "C2@2=4.50");

    mvc.perform(get(LAB, lab).with(actor(ta, "TA")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(lab.toString()))
        .andExpect(jsonPath("$.tests.length()").value(2));
  }

  @Test
  void limitsDefaultToFaq05() throws Exception {
    Map<String, Object> body = body();
    body.remove("constraints");
    create(ta, body)
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.cpuTimeMs").value(1000))
        .andExpect(jsonPath("$.wallTimeMs").value(3000))
        .andExpect(jsonPath("$.memoryMb").value(256))
        .andExpect(jsonPath("$.constraints.length()").value(0));
  }

  @Test
  void invalidBodiesAreRejectedAndWriteNothing() throws Exception {
    rejects(b -> b.put("tests", List.of()), "tests");
    rejects(b -> b.remove("tests"), "tests");
    rejects(
        b -> b.put("constraints", List.of(constraint("C1", 1), constraint("C1", 2))),
        "constraints[1].code");
    rejects(b -> b.put("constraints", List.of(constraint("c1", 1))), "constraints[0].code");
    rejects(b -> b.put("constraints", List.of(constraint("C01", 1))), "constraints[0].code");
    rejects(b -> b.put("constraints", List.of(constraint("C1", 0))), "constraints[0].deduction");
    rejects(
        b -> b.put("constraints", List.of(constraint("C1", 10.01))), "constraints[0].deduction");
    rejects(
        b -> b.put("constraints", List.of(constraint("C1", 1.005))), "constraints[0].deduction");
    rejects(b -> b.put("cpuTimeMs", 999), "cpuTimeMs");
    rejects(b -> b.put("cpuTimeMs", 5001), "cpuTimeMs");
    rejects(b -> b.put("memoryMb", 63), "memoryMb");
    rejects(b -> b.put("memoryMb", 513), "memoryMb");
    rejects(b -> b.put("dueAt", "2026-11-24T01:00:00Z"), "dueAt");
    rejects(b -> b.put("opensAt", "2026-11-24 01:00"), "opensAt");
    rejects(b -> b.put("title", "   "), "title");
    rejects(b -> b.put("statementMd", ""), "statementMd");
    rejects(b -> b.put("classId", otherClass.toString()), "body");

    mvc.perform(
            post(CLASS_LABS, classId)
                .with(actor(ta, "TA"))
                .contentType(MediaType.TEXT_PLAIN)
                .content("{}"))
        .andExpect(status().isUnsupportedMediaType())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:unsupported-media-type"));
    mvc.perform(post(CLASS_LABS, "not-a-uuid").with(actor(ta, "TA")))
        .andExpect(status().isBadRequest());

    assertThat(jdbc.sql("select count(*) from labs").query(Integer.class).single()).isZero();
  }

  @Test
  void taOfAnotherClassGetsNotFound() throws Exception {
    UUID lab = createdLab();
    create(otherTa, body())
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:class-not-found"));
    mvc.perform(get(CLASS_LABS, classId).with(actor(otherTa, "TA")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:class-not-found"));
    mvc.perform(get(CLASS_LABS, UUID.randomUUID()).with(actor(ta, "TA")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:class-not-found"));
    mvc.perform(get(LAB, lab).with(actor(otherTa, "TA")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:lab-not-found"));
    mvc.perform(get(LAB, UUID.randomUUID()).with(actor(ta, "TA")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:lab-not-found"));
  }

  @Test
  void wrongRolesAreForbidden() throws Exception {
    UUID lab = createdLab();
    create(alice, body())
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:forbidden-role"));
    mvc.perform(get(CLASS_LABS, classId).with(actor(alice, "STUDENT")))
        .andExpect(status().isForbidden());
    create(admin, body()).andExpect(status().isForbidden());
    mvc.perform(get(LAB, lab).with(actor(admin, "ADMIN")))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:forbidden-role"));
  }

  @Test
  void unauthenticatedRequestsAreRejected() throws Exception {
    mvc.perform(get(CLASS_LABS, classId))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:unauthenticated"));
    mvc.perform(get(CLASS_LABS, classId).with(actor(UUID.randomUUID(), "TA")))
        .andExpect(status().isUnauthorized());
    mvc.perform(get(CLASS_LABS, classId).with(actor(alice, "TA")))
        .andExpect(status().isUnauthorized());
    mvc.perform(get(LAB, UUID.randomUUID()).with(actor(ta, "STUDENT")))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void listShowsLabsWithSubmissionCounts() throws Exception {
    UUID older = lab(classId, "Older", "now() - interval '10 days'");
    final UUID newer = lab(classId, "Newer", "now() - interval '1 day'");
    lab(otherClass, "Elsewhere", "now() - interval '1 day'");
    UUID bob = user("STUDENT");
    submission(older, alice);
    submission(older, alice);
    submission(older, bob);

    mvc.perform(get(CLASS_LABS, classId).with(actor(ta, "TA")))
        .andExpect(status().isOk())
        .andExpect(header().string("Cache-Control", "no-store"))
        .andExpect(jsonPath("$.length()").value(2))
        .andExpect(jsonPath("$[0].id").value(newer.toString()))
        .andExpect(jsonPath("$[0].submissionCount").value(0))
        .andExpect(jsonPath("$[0].studentsSubmitted").value(0))
        .andExpect(jsonPath("$[1].id").value(older.toString()))
        .andExpect(jsonPath("$[1].title").value("Older"))
        .andExpect(jsonPath("$[1].opensAt").isString())
        .andExpect(jsonPath("$[1].dueAt").isString())
        .andExpect(jsonPath("$[1].cpuTimeMs").value(1000))
        .andExpect(jsonPath("$[1].memoryMb").value(256))
        .andExpect(jsonPath("$[1].testCount").value(1))
        .andExpect(jsonPath("$[1].constraintCount").value(1))
        .andExpect(jsonPath("$[1].submissionCount").value(3))
        .andExpect(jsonPath("$[1].studentsSubmitted").value(2));
  }

  @Test
  void studentSeesStatementAndDeductionsButNoTests() throws Exception {
    UUID open = lab(classId, "Open", "now() - interval '1 day'");
    UUID future = lab(classId, "Future", "now() + interval '1 day'");

    mvc.perform(get(LAB, open).with(actor(alice, "STUDENT")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.title").value("Open"))
        .andExpect(jsonPath("$.statementMd").value("Statement of Open"))
        .andExpect(jsonPath("$.wallTimeMs").value(3000))
        .andExpect(jsonPath("$.constraints[0].code").value("C1"))
        .andExpect(jsonPath("$.constraints[0].text").value("No std::sort."))
        .andExpect(jsonPath("$.constraints[0].deduction").value(2.5))
        .andExpect(jsonPath("$.tests").doesNotHaveJsonPath());
    mvc.perform(get(LAB, open).with(actor(outsider, "STUDENT")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:lab-not-found"));
    mvc.perform(get(LAB, future).with(actor(alice, "STUDENT")))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:lab-not-open"));
    mvc.perform(get(LAB, future).with(actor(ta, "TA")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.tests.length()").value(1));
  }

  private void rejects(Consumer<Map<String, Object>> change, String field) throws Exception {
    Map<String, Object> body = body();
    change.accept(body);
    create(ta, body)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:invalid-request"))
        .andExpect(jsonPath("$.errors[0].field").value(field));
  }

  private UUID createdLab() throws Exception {
    String location =
        create(ta, body())
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getHeader("Location");
    return UUID.fromString(location.substring("/labs/".length()));
  }

  private ResultActions create(UUID actor, Map<String, Object> body) throws Exception {
    String role =
        jdbc.sql("select role from users where id = ?").param(actor).query(String.class).single();
    return mvc.perform(
        post(CLASS_LABS, classId)
            .with(actor(actor, role))
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(body)));
  }

  private static Map<String, Object> body() {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("title", "Sorting with merge sort");
    body.put("statementMd", "# Sort\n\nRead `n` integers.");
    body.put("opensAt", "2026-11-24T08:00:00+07:00");
    body.put("dueAt", "2026-12-01T16:59:59Z");
    body.put(
        "tests",
        new ArrayList<>(
            List.of(
                Map.of("input", "3\n3 1 2\n", "expectedOutput", "1 2 3\n"),
                Map.of("input", "1\n5\n", "expectedOutput", "5\n"))));
    body.put("constraints", new ArrayList<>(List.of(constraint("C1", 3), constraint("C2", 4.5))));
    return body;
  }

  private static Map<String, Object> constraint(String code, Number deduction) {
    return Map.of("code", code, "text", "Rule " + code + ".", "deduction", deduction);
  }

  private UUID lab(UUID inClass, String title, String opensAt) {
    UUID id = UUID.randomUUID();
    jdbc.sql(
            "insert into labs (id, class_id, title, statement_md, opens_at, due_at) values (?, ?,"
                + " ?, ?, "
                + opensAt
                + ", now() + interval '20 days')")
        .params(id, inClass, title, "Statement of " + title)
        .update();
    jdbc.sql("insert into lab_tests values (?, 1, '1\n', '1\n')").param(id).update();
    jdbc.sql(
            "insert into lab_constraints (lab_id, code, ordinal, text, deduction)"
                + " values (?, 'C1', 1, 'No std::sort.', 2.5)")
        .param(id)
        .update();
    return id;
  }

  private void submission(UUID lab, UUID student) {
    UUID id = UUID.randomUUID();
    jdbc.sql(
            """
            insert into submissions
              (id, lab_id, student_id, idempotency_key, code, size_bytes, submitted_at)
            values (?, ?, ?, ?, 'int main() {}', 13, now())
            """)
        .params(id, lab, student, id.toString())
        .update();
  }

  private UUID user(String role) {
    UUID id = UUID.randomUUID();
    jdbc.sql("insert into users (id, role) values (?, ?)").params(id, role).update();
    return id;
  }

  private static RequestPostProcessor actor(UUID id, String role) {
    return jwt().jwt(token -> token.subject(id.toString()).claim("role", role));
  }
}
