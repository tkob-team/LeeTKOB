package com.leetkob.backend.seed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/** The one-shot {@code seed} process of the public deployment (T84). */
@ExtendWith(OutputCaptureExtension.class)
class SeedApplicationTest {

  /** Fake values for tests only; spaces keep them obviously not real secrets. */
  private static final String ADMIN_VALUE = "admin seed value for tests";

  private static final String TA_VALUE = "ta seed value for tests";
  private static final String STUDENT_VALUE = "student seed value for tests";

  private static final PostgreSQLContainer POSTGRES =
      new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"));

  private static JdbcClient jdbc;

  @BeforeAll
  static void start() {
    POSTGRES.start();
    jdbc =
        JdbcClient.create(
            new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()));
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  /** Every test starts from migrated-or-empty tables. */
  @BeforeEach
  void clean() {
    boolean migrated =
        jdbc.sql("select to_regclass('users') is not null").query(Boolean.class).single();
    if (migrated) {
      jdbc.sql("truncate users, classes, labs cascade").update();
    }
  }

  private static Map<String, String> env() {
    var env = new HashMap<String, String>();
    env.put(SeedPasswords.ADMIN, ADMIN_VALUE);
    env.put(SeedPasswords.TA, TA_VALUE);
    env.put(SeedPasswords.STUDENT, STUDENT_VALUE);
    return env;
  }

  private static TestAccountSeeder.Result seed(Map<String, String> env) {
    return SeedApplication.run(
        env,
        "--spring.datasource.url=" + POSTGRES.getJdbcUrl(),
        "--spring.datasource.username=" + POSTGRES.getUsername(),
        "--spring.datasource.password=" + POSTGRES.getPassword());
  }

  @Test
  void seedsAccountsAndClassesOnceAndNoLab(CapturedOutput output) {
    assertThat(seed(env())).isEqualTo(new TestAccountSeeder.Result(5, 2));
    assertThat(seed(env())).isEqualTo(new TestAccountSeeder.Result(0, 0));

    assertThat(
            jdbc.sql("select email || ' ' || role from users order by email")
                .query(String.class)
                .list())
        .containsExactly(
            "admin@leetkob.test ADMIN",
            "sv1@leetkob.test STUDENT",
            "sv2@leetkob.test STUDENT",
            "ta1@leetkob.test TA",
            "ta2@leetkob.test TA");
    assertThat(
            jdbc.sql(
                    """
                    select c.name || ' ' || u.email from classes c
                    join class_tas t on t.class_id = c.id join users u on u.id = t.user_id
                    order by c.name
                    """)
                .query(String.class)
                .list())
        .containsExactly("Lớp thử nghiệm 1 ta1@leetkob.test", "Lớp thử nghiệm 2 ta2@leetkob.test");
    assertThat(
            jdbc.sql(
                    """
                    select c.name || ' ' || u.email from classes c
                    join class_members m on m.class_id = c.id join users u on u.id = m.user_id
                    order by u.email
                    """)
                .query(String.class)
                .list())
        .containsExactly("Lớp thử nghiệm 1 sv1@leetkob.test", "Lớp thử nghiệm 1 sv2@leetkob.test");
    assertThat(jdbc.sql("select count(*) from labs").query(Integer.class).single()).isZero();
    assertThat(
            jdbc.sql("select count(*) from classes where invite_code ~ '^[A-Za-z0-9_-]{32}$'")
                .query(Integer.class)
                .single())
        .isEqualTo(2);

    var encoder = new BCryptPasswordEncoder();
    assertThat(encoder.matches(ADMIN_VALUE, hashOf("admin@leetkob.test"))).isTrue();
    assertThat(encoder.matches(TA_VALUE, hashOf("ta2@leetkob.test"))).isTrue();
    assertThat(encoder.matches(STUDENT_VALUE, hashOf("sv1@leetkob.test"))).isTrue();

    assertThat(output.getAll())
        .contains("event=seed_finished accountsCreated=0 classesCreated=0")
        .doesNotContain(ADMIN_VALUE, TA_VALUE, STUDENT_VALUE)
        .doesNotContainIgnoringCase("generated security password");
  }

  @Test
  void secondRunWithOtherPasswordsKeepsExistingOnes() {
    seed(env());
    var changed = env();
    changed.put(SeedPasswords.TA, "another ta value for tests");
    seed(changed);
    assertThat(new BCryptPasswordEncoder().matches(TA_VALUE, hashOf("ta1@leetkob.test"))).isTrue();
  }

  @Test
  void missingShortOrLongPasswordsAreRefusedByNameOnly() {
    var env = env();
    env.remove(SeedPasswords.ADMIN);
    env.put(SeedPasswords.TA, "short");
    env.put(SeedPasswords.STUDENT, "x".repeat(73));
    assertThatThrownBy(() -> seed(env))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage(
            "Seed refused: SEED_ADMIN_PASSWORD is not set; "
                + "SEED_TA_PASSWORD must have at least 12 characters; "
                + "SEED_STUDENT_PASSWORD must be at most 72 bytes in UTF-8")
        .hasMessageNotContaining("short");
    assertThat(SeedPasswords.fromEnvironment(env()).toString())
        .isEqualTo("SeedPasswords[redacted]");
  }

  @Test
  void existingAccountWithAnotherRoleStopsTheSeedWithoutChanges() {
    seed(env());
    jdbc.sql("update users set role = 'STUDENT' where email = 'ta2@leetkob.test'").update();
    jdbc.sql("delete from class_members").update();
    assertThatThrownBy(() -> seed(env()))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("ta2@leetkob.test already exists with role STUDENT");
    assertThat(jdbc.sql("select count(*) from class_members").query(Integer.class).single())
        .isZero();
    jdbc.sql("update users set role = 'TA' where email = 'ta2@leetkob.test'").update();
    assertThat(seed(env())).isEqualTo(new TestAccountSeeder.Result(0, 0));
  }

  private static String hashOf(String email) {
    return jdbc.sql("select password_hash from users where email = ?")
        .param(email)
        .query(String.class)
        .single();
  }
}
