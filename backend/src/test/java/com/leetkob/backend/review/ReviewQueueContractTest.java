package com.leetkob.backend.review;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.leetkob.backend.TestcontainersConfiguration;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** {@code GET /labs/{labId}/review-queue}, as specified in docs/contract/get-review-queue.md. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ReviewQueueContractTest {

  private static final String PATH = "/labs/{lab}/review-queue";

  @Autowired private JdbcClient jdbc;
  @Autowired private MockMvc mvc;

  private UUID ta;
  private UUID otherTa;
  private UUID admin;
  private UUID alice;
  private UUID bob;
  private UUID classId;
  private UUID lab;

  @BeforeEach
  void seed() {
    jdbc.sql(
            "truncate model_calls, submissions, labs, class_members, class_tas, classes, users"
                + " cascade")
        .update();
    ta = user("TA", "Thay Ta");
    otherTa = user("TA", "Other Ta");
    admin = user("ADMIN", null);
    alice = user("STUDENT", "Alice");
    bob = user("STUDENT", "Bob");
    classId = UUID.randomUUID();
    final UUID otherClass = UUID.randomUUID();
    jdbc.sql("insert into classes (id, name) values (?, 'Home'), (?, 'Other')")
        .params(classId, otherClass)
        .update();
    jdbc.sql("insert into class_tas values (?, ?), (?, ?)")
        .params(classId, ta, otherClass, otherTa)
        .update();
    jdbc.sql("insert into class_members values (?, ?), (?, ?)")
        .params(classId, alice, classId, bob)
        .update();
    lab = UUID.randomUUID();
    jdbc.sql(
            """
            insert into labs (id, class_id, title, opens_at, due_at)
            values (?, ?, 'Sort', now() - interval '2 days', now() - interval '1 hour')
            """)
        .params(lab, classId)
        .update();
    jdbc.sql(
            """
            insert into lab_constraints (lab_id, code, ordinal, text, deduction)
            values (?, 'C2', 2, 'Sort with a merge sort you wrote yourself.', 4),
                   (?, 'C1', 1, 'Do not call a library sort function: `std::sort`.', 3)
            """)
        .params(lab, lab)
        .update();
  }

  @Test
  void assignedTaSeesCountedSubmissionsWithFindings() throws Exception {
    final UUID older = submission(alice, 7200);
    finish(older, "AC");
    final UUID counted = submission(alice, 5400);
    finish(counted, "AC");
    submission(alice, 1800); // after the deadline: never counted
    finding(older, "C1", "pass", "hard_rule", "[]", null);
    finding(
        counted, "C1", "violation", "hard_rule", "[{\"line\": 3, \"text\": \"  sort(a);\"}]", null);
    finding(counted, "C2", "unsure", "guardrail", "[]", "timeout");

    mvc.perform(get(PATH, lab).with(actor(ta, "TA")))
        .andExpect(status().isOk())
        .andExpect(header().string("Cache-Control", "no-store"))
        .andExpect(jsonPath("$.labId").value(lab.toString()))
        .andExpect(jsonPath("$.provisional").value(false))
        .andExpect(jsonPath("$.totalItems").value(1))
        .andExpect(jsonPath("$.items[0].submissionId").value(counted.toString()))
        .andExpect(jsonPath("$.items[0].student.id").value(alice.toString()))
        .andExpect(jsonPath("$.items[0].student.displayName").value("Alice"))
        .andExpect(jsonPath("$.items[0].submittedAt").isString())
        .andExpect(jsonPath("$.items[0].judgeStatus").value("completed"))
        .andExpect(jsonPath("$.items[0].verdict").value("AC"))
        .andExpect(jsonPath("$.items[0].reviewStatus").value("checked"))
        .andExpect(jsonPath("$.items[0].needsReview").value(true))
        .andExpect(jsonPath("$.items[0].constraints.length()").value(2))
        .andExpect(jsonPath("$.items[0].constraints[0].code").value("C1"))
        .andExpect(
            jsonPath("$.items[0].constraints[0].text")
                .value("Do not call a library sort function: `std::sort`."))
        .andExpect(jsonPath("$.items[0].constraints[0].deduction").value(3.0))
        .andExpect(jsonPath("$.items[0].constraints[0].verdict").value("violation"))
        .andExpect(jsonPath("$.items[0].constraints[0].source").value("hard_rule"))
        .andExpect(jsonPath("$.items[0].constraints[0].evidence[0].line").value(3))
        .andExpect(jsonPath("$.items[0].constraints[0].evidence[0].text").value("  sort(a);"))
        .andExpect(jsonPath("$.items[0].constraints[0].reason").value("checker reason"))
        .andExpect(jsonPath("$.items[0].constraints[0].unsureCause").isEmpty())
        .andExpect(jsonPath("$.items[0].constraints[0].needsReview").value(true))
        .andExpect(jsonPath("$.items[0].constraints[1].code").value("C2"))
        .andExpect(jsonPath("$.items[0].constraints[1].deduction").value(4.0))
        .andExpect(jsonPath("$.items[0].constraints[1].verdict").value("unsure"))
        .andExpect(jsonPath("$.items[0].constraints[1].unsureCause").value("timeout"))
        .andExpect(jsonPath("$.items[0].constraints[1].needsReview").value(true))
        .andExpect(jsonPath("$.items[0].code").doesNotHaveJsonPath())
        .andExpect(jsonPath("$.items[0].publish").doesNotHaveJsonPath());
  }

  @Test
  void taOfAnotherClassGetsLabNotFound() throws Exception {
    mvc.perform(get(PATH, lab).with(actor(otherTa, "TA")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:lab-not-found"));
    mvc.perform(get(PATH, UUID.randomUUID()).with(actor(ta, "TA")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:lab-not-found"));
  }

  @Test
  void studentAndAdminAreForbidden() throws Exception {
    mvc.perform(get(PATH, lab).with(actor(alice, "STUDENT")))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:forbidden-role"));
    mvc.perform(get(PATH, lab).with(actor(admin, "ADMIN")))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:forbidden-role"));
  }

  @Test
  void unauthenticatedRequestIsRejected() throws Exception {
    mvc.perform(get(PATH, lab))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:unauthenticated"));
    mvc.perform(get(PATH, lab).with(actor(UUID.randomUUID(), "TA")))
        .andExpect(status().isUnauthorized());
    mvc.perform(get(PATH, lab).with(actor(alice, "TA"))).andExpect(status().isUnauthorized());
  }

  @Test
  void itemsNeedingReviewComeFirstAcrossPages() throws Exception {
    UUID clean = submission(alice, 7000); // earlier, but passes everything
    finish(clean, "AC");
    finding(clean, "C1", "pass", "hard_rule", "[]", null);
    finding(clean, "C2", "pass", "model", "[]", null);
    UUID flagged = submission(bob, 6000);
    finish(flagged, "AC");
    finding(flagged, "C1", "pass", "hard_rule", "[]", null);
    finding(flagged, "C2", "violation", "model", "[{\"line\": 1, \"text\": \"x\"}]", null);

    mvc.perform(get(PATH, lab).param("size", "1").with(actor(ta, "TA")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.page").value(0))
        .andExpect(jsonPath("$.size").value(1))
        .andExpect(jsonPath("$.totalItems").value(2))
        .andExpect(jsonPath("$.totalPages").value(2))
        .andExpect(jsonPath("$.items.length()").value(1))
        .andExpect(jsonPath("$.items[0].submissionId").value(flagged.toString()))
        .andExpect(jsonPath("$.items[0].needsReview").value(true));
    mvc.perform(get(PATH, lab).param("size", "1").param("page", "1").with(actor(ta, "TA")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].submissionId").value(clean.toString()))
        .andExpect(jsonPath("$.items[0].needsReview").value(false))
        .andExpect(jsonPath("$.items[0].constraints[1].needsReview").value(false));
    mvc.perform(get(PATH, lab).param("page", "5").with(actor(ta, "TA")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items").isEmpty());
  }

  @Test
  void submissionWithoutAllFindingsIsReviewing() throws Exception {
    UUID accepted = submission(alice, 7000);
    finish(accepted, "AC");
    finding(accepted, "C1", "pass", "hard_rule", "[]", null);
    UUID wrong = submission(bob, 6000);
    finish(wrong, "WA");

    mvc.perform(get(PATH, lab).with(actor(ta, "TA")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].submissionId").value(accepted.toString()))
        .andExpect(jsonPath("$.items[0].reviewStatus").value("reviewing"))
        .andExpect(jsonPath("$.items[0].constraints[1].verdict").isEmpty())
        .andExpect(jsonPath("$.items[0].constraints[1].source").isEmpty())
        .andExpect(jsonPath("$.items[0].constraints[1].evidence").isEmpty())
        .andExpect(jsonPath("$.items[0].constraints[1].needsReview").value(false))
        .andExpect(jsonPath("$.items[1].submissionId").value(wrong.toString()))
        .andExpect(jsonPath("$.items[1].verdict").value("WA"))
        .andExpect(jsonPath("$.items[1].reviewStatus").value("not_checked"));
  }

  @Test
  void invalidPagingIsRejected() throws Exception {
    for (String[] query :
        new String[][] {{"page", "-1"}, {"size", "0"}, {"size", "101"}, {"page", "x"}}) {
      mvc.perform(get(PATH, lab).param(query[0], query[1]).with(actor(ta, "TA")))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.type").value("urn:leetkob:problem:invalid-request"));
    }
    mvc.perform(get("/labs/not-a-uuid/review-queue").with(actor(ta, "TA")))
        .andExpect(status().isBadRequest());
  }

  private UUID user(String role, String displayName) {
    UUID id = UUID.randomUUID();
    jdbc.sql("insert into users (id, role, display_name) values (?, ?, ?)")
        .params(id, role, displayName)
        .update();
    return id;
  }

  private UUID submission(UUID student, int secondsAgo) {
    UUID id = UUID.randomUUID();
    jdbc.sql(
            """
            with submitted as (
              insert into submissions
                (id, lab_id, student_id, idempotency_key, code, size_bytes, submitted_at)
              values (?, ?, ?, ?, 'int main() {}', 13, now() - ? * interval '1 second')
              returning id, submitted_at
            )
            insert into judge_jobs (submission_id, enqueued_at)
            select id, submitted_at from submitted
            """)
        .params(id, lab, student, id.toString(), secondsAgo)
        .update();
    return id;
  }

  private void finish(UUID id, String verdict) {
    jdbc.sql(
            """
            update judge_jobs set finished_at = now(), result = jsonb_build_object(
              'verdict', cast(? as text), 'tests', jsonb_build_array(
                jsonb_build_object('number', 1, 'verdict', cast(? as text))))
            where submission_id = ?
            """)
        .params(verdict, verdict, id)
        .update();
  }

  private void finding(
      UUID submission, String code, String verdict, String source, String evidence, String cause) {
    jdbc.sql(
            """
            insert into findings (submission_id, constraint_code, verdict, source, evidence,
                                  reason, unsure_cause)
            values (?, ?, ?, ?, cast(? as jsonb), 'checker reason', ?)
            """)
        .params(submission, code, verdict, source, evidence, cause)
        .update();
  }

  private static RequestPostProcessor actor(UUID id, String role) {
    return jwt().jwt(token -> token.subject(id.toString()).claim("role", role));
  }
}
