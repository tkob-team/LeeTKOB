package com.leetkob.backend.submission;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.leetkob.backend.TestcontainersConfiguration;
import java.time.Instant;
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

/** Student polling and the counted submission rule, using the real HTTP and database layers. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SubmissionStatusContractTest {

  private static final String TIME = "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z";

  @Autowired private JdbcClient jdbc;
  @Autowired private MockMvc mvc;

  private UUID student;
  private UUID peer;
  private UUID lab;
  private UUID otherLab;
  private UUID earlier;
  private UUID latest;

  @BeforeEach
  void seed() {
    jdbc.sql("truncate submissions, labs, class_members, classes, users cascade").update();
    student = UUID.randomUUID();
    peer = UUID.randomUUID();
    final UUID classId = UUID.randomUUID();
    final UUID otherClass = UUID.randomUUID();
    lab = UUID.randomUUID();
    otherLab = UUID.randomUUID();
    jdbc.sql("insert into users (id) values (?), (?)").params(student, peer).update();
    jdbc.sql("insert into classes (id, name) values (?, 'Home class'), (?, 'Other class')")
        .params(classId, otherClass)
        .update();
    jdbc.sql("insert into class_members values (?, ?), (?, ?), (?, ?)")
        .params(classId, student, classId, peer, otherClass, peer)
        .update();
    jdbc.sql(
            """
            insert into labs (id, class_id, title, opens_at, due_at)
            values (?, ?, 'Visible', now() - interval '1 day', now() + interval '1 day'),
                   (?, ?, 'Other', now() - interval '1 day', now() + interval '1 day')
            """)
        .params(lab, classId, otherLab, otherClass)
        .update();
    earlier = submission(120);
    latest = submission(60);
  }

  @Test
  void latestCountsEvenWhenAnEarlierSubmissionWasAccepted() throws Exception {
    finish(earlier, "AC");
    mvc.perform(
            get("/labs/{lab}/submissions/{submission}", lab, latest)
                .with(actor(student, "STUDENT")))
        .andExpect(status().isOk())
        .andExpect(header().string("Cache-Control", "no-store"))
        .andExpect(jsonPath("$.status").value("queued"))
        .andExpect(jsonPath("$.counted").value(true))
        .andExpect(jsonPath("$.tests").isEmpty());

    finish(latest, "WA");
    mvc.perform(
            get("/labs/{lab}/submissions/{submission}", lab, latest)
                .with(actor(student, "STUDENT")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("completed"))
        .andExpect(jsonPath("$.verdict").value("WA"))
        .andExpect(jsonPath("$.tests[0].number").value(1))
        .andExpect(jsonPath("$.tests[0].verdict").value("WA"))
        .andExpect(jsonPath("$.counted").value(true))
        .andExpect(jsonPath("$.code").doesNotHaveJsonPath())
        .andExpect(jsonPath("$.tests[0].input").doesNotHaveJsonPath())
        .andExpect(jsonPath("$.tests[0].expectedOutput").doesNotHaveJsonPath())
        .andExpect(jsonPath("$.findings").doesNotHaveJsonPath());
    mvc.perform(
            get("/labs/{lab}/submissions/{submission}", lab, earlier)
                .with(actor(student, "STUDENT")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.verdict").value("AC"))
        .andExpect(jsonPath("$.counted").value(false));
  }

  @Test
  void strangersAndWrongLabsDoNotRevealSubmissions() throws Exception {
    mvc.perform(
            get("/labs/{lab}/submissions/{submission}", lab, latest).with(actor(peer, "STUDENT")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:submission-not-found"));
    mvc.perform(
            get("/labs/{lab}/submissions/{submission}", otherLab, latest)
                .with(actor(student, "STUDENT")))
        .andExpect(status().isNotFound());
    mvc.perform(get("/labs/{lab}/submissions/{submission}", lab, latest).with(actor(student, "TA")))
        .andExpect(status().isForbidden());
    mvc.perform(get("/labs/{lab}/submissions/{submission}", lab, latest))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void labPickerOnlyListsMembershipAndRemembersLatestSubmission() throws Exception {
    mvc.perform(get("/student/labs").with(actor(student, "STUDENT")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].id").value(lab.toString()))
        .andExpect(jsonPath("$[0].title").value("Visible"))
        .andExpect(jsonPath("$[0].latestSubmissionId").value(latest.toString()))
        .andExpect(jsonPath("$[0].tests").doesNotHaveJsonPath());
  }

  @Test
  void labListCarriesTimesAndTheLatestVerdict() throws Exception {
    finish(earlier, "AC");
    mvc.perform(get("/student/labs").with(actor(student, "STUDENT")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value(lab.toString()))
        .andExpect(jsonPath("$[0].opensAt").value(matchesPattern(TIME)))
        .andExpect(jsonPath("$[0].dueAt").value(matchesPattern(TIME)))
        .andExpect(jsonPath("$[0].latestSubmissionId").value(latest.toString()))
        .andExpect(jsonPath("$[0].latestVerdict").isEmpty()); // latest is still queued

    jdbc.sql(
            "update judge_jobs set lease_token = gen_random_uuid(),"
                + " lease_expires_at = now() + interval '1 minute' where submission_id = ?")
        .param(latest)
        .update();
    mvc.perform(get("/student/labs").with(actor(student, "STUDENT")))
        .andExpect(jsonPath("$[0].latestVerdict").isEmpty()); // grading

    jdbc.sql(
            "update judge_jobs set lease_token = null, lease_expires_at = null"
                + " where submission_id = ?")
        .param(latest)
        .update();
    finish(latest, "WA");
    mvc.perform(get("/student/labs").with(actor(student, "STUDENT")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].latestVerdict").value("WA"))
        .andExpect(jsonPath("$[0].findings").doesNotHaveJsonPath())
        .andExpect(jsonPath("$[0].statementMd").doesNotHaveJsonPath());
  }

  @Test
  void labNotOpenYetListsItsTimesButNotItsStatement() throws Exception {
    UUID future = UUID.randomUUID();
    jdbc.sql(
            """
            insert into labs (id, class_id, title, statement_md, opens_at, due_at)
            select ?, class_id, 'Future', 'SECRET STATEMENT',
                   timestamptz '2099-01-02T03:04:05.678Z', timestamptz '2099-01-09T03:04:05.678Z'
            from labs where id = ?
            """)
        .params(future, lab)
        .update();

    mvc.perform(get("/student/labs").with(actor(student, "STUDENT")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(2))
        .andExpect(jsonPath("$[0].id").value(future.toString()))
        .andExpect(jsonPath("$[0].title").value("Future"))
        .andExpect(jsonPath("$[0].opensAt").value("2099-01-02T03:04:05.678Z"))
        .andExpect(jsonPath("$[0].dueAt").value("2099-01-09T03:04:05.678Z"))
        .andExpect(jsonPath("$[0].latestSubmissionId").isEmpty())
        .andExpect(jsonPath("$[0].latestVerdict").isEmpty())
        .andExpect(jsonPath("$[0].statementMd").doesNotHaveJsonPath())
        .andExpect(content().string(not(containsString("SECRET STATEMENT"))));
    mvc.perform(get("/labs/{lab}", future).with(actor(student, "STUDENT")))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:lab-not-open"));
  }

  @Test
  void studentOfAnotherClassDoesNotSeeTheLab() throws Exception {
    UUID outsider = UUID.randomUUID();
    jdbc.sql("insert into users (id) values (?)").param(outsider).update();
    jdbc.sql("insert into class_members select class_id, ? from labs where id = ?")
        .params(outsider, otherLab)
        .update();

    mvc.perform(get("/student/labs").with(actor(outsider, "STUDENT")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].id").value(otherLab.toString()))
        .andExpect(jsonPath("$[0].latestSubmissionId").isEmpty())
        .andExpect(jsonPath("$[0].latestVerdict").isEmpty())
        .andExpect(content().string(not(containsString(lab.toString()))));
  }

  @Test
  void streamReturnsTheInitialVerdictAndClosesWhenCompleted() throws Exception {
    finish(latest, "WA");
    var stream =
        mvc.perform(
                get("/labs/{lab}/submissions/{submission}/events", lab, latest)
                    .accept("text/event-stream")
                    .with(actor(student, "STUDENT")))
            .andExpect(request().asyncStarted())
            .andExpect(header().string("X-Accel-Buffering", "no"))
            .andReturn();
    mvc.perform(asyncDispatch(stream))
        .andExpect(status().isOk())
        .andExpect(content().string(containsString("event:status")))
        .andExpect(content().string(containsString("\"verdict\":\"WA\"")));
  }

  @Test
  void streamDoesNotRevealAnotherStudentsSubmission() throws Exception {
    mvc.perform(
            get("/labs/{lab}/submissions/{submission}/events", lab, latest)
                .accept("text/event-stream", "application/problem+json")
                .with(actor(peer, "STUDENT")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.type").value("urn:leetkob:problem:submission-not-found"));
  }

  @Test
  void streamFollowsQueuedSubmissionThroughCompletion() throws Exception {
    var stream =
        mvc.perform(
                get("/labs/{lab}/submissions/{submission}/events", lab, latest)
                    .accept("text/event-stream")
                    .with(actor(student, "STUDENT")))
            .andExpect(request().asyncStarted())
            .andReturn();
    finish(latest, "WA");
    mvc.perform(asyncDispatch(stream))
        .andExpect(status().isOk())
        .andExpect(content().string(containsString("\"status\":\"queued\"")))
        .andExpect(content().string(containsString("\"status\":\"completed\"")));
  }

  @Test
  void streamClosesAtExpiryAndReconnectReturnsTheCurrentVerdict() throws Exception {
    var expiring =
        jwt()
            .jwt(token ->
                token
                    .subject(student.toString())
                    .claim("role", "STUDENT")
                    .expiresAt(Instant.now().plusSeconds(2)));
    var first =
        mvc.perform(
                get("/labs/{lab}/submissions/{submission}/events", lab, latest)
                    .accept("text/event-stream")
                    .with(expiring))
            .andExpect(request().asyncStarted())
            .andReturn();
    mvc.perform(asyncDispatch(first))
        .andExpect(status().isOk())
        .andExpect(content().string(containsString("\"status\":\"queued\"")));

    finish(latest, "WA");
    var reconnected =
        mvc.perform(
                get("/labs/{lab}/submissions/{submission}/events", lab, latest)
                    .accept("text/event-stream")
                    .with(actor(student, "STUDENT")))
            .andExpect(request().asyncStarted())
            .andReturn();
    mvc.perform(asyncDispatch(reconnected))
        .andExpect(status().isOk())
        .andExpect(content().string(containsString("\"status\":\"completed\"")));
  }

  @Test
  void streamRequiresAuthenticationAndTheOriginalLab() throws Exception {
    mvc.perform(get("/labs/{lab}/submissions/{submission}/events", lab, latest))
        .andExpect(status().isUnauthorized());
    mvc.perform(
            get("/labs/{lab}/submissions/{submission}/events", otherLab, latest)
                .with(actor(student, "STUDENT")))
        .andExpect(status().isNotFound());
  }

  private UUID submission(int secondsAgo) {
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

  private static RequestPostProcessor actor(UUID id, String role) {
    return jwt()
        .jwt(token ->
            token
                .subject(id.toString())
                .claim("role", role)
                .expiresAt(Instant.now().plusSeconds(60)));
  }
}
