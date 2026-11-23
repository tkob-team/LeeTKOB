package com.leetkob.backend.seed;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Creates the test accounts and classes of the public deployment: one admin, two TAs, two students,
 * two classes (one per TA) and both students in the first TA's class. No lab is created; TAs create
 * labs through the UI.
 *
 * <p>Idempotent: accounts are found by email and classes by fixed id, so a second run creates
 * nothing and never changes an existing password.
 */
final class TestAccountSeeder {

  record Account(String email, String displayName, String role) {}

  record ClassSeed(UUID id, String name, String taEmail, List<String> studentEmails) {}

  record Result(int accountsCreated, int classesCreated) {}

  private record Row(UUID id, String role) {}

  static final Account ADMIN = new Account("admin@leetkob.test", "Quản trị viên", "ADMIN");
  static final Account TA_1 = new Account("ta1@leetkob.test", "Trợ giảng 1", "TA");
  static final Account TA_2 = new Account("ta2@leetkob.test", "Trợ giảng 2", "TA");
  static final Account STUDENT_1 = new Account("sv1@leetkob.test", "Sinh viên 1", "STUDENT");
  static final Account STUDENT_2 = new Account("sv2@leetkob.test", "Sinh viên 2", "STUDENT");
  static final List<Account> ACCOUNTS = List.of(ADMIN, TA_1, TA_2, STUDENT_1, STUDENT_2);

  static final List<ClassSeed> CLASSES =
      List.of(
          new ClassSeed(
              UUID.fromString("5eed0000-0000-4000-8000-000000000001"),
              "Lớp thử nghiệm 1",
              TA_1.email(),
              List.of(STUDENT_1.email(), STUDENT_2.email())),
          new ClassSeed(
              UUID.fromString("5eed0000-0000-4000-8000-000000000002"),
              "Lớp thử nghiệm 2",
              TA_2.email(),
              List.of()));

  private static final SecureRandom RANDOM = new SecureRandom();

  private final JdbcClient jdbc;
  private final TransactionTemplate transaction;
  private final PasswordEncoder encoder;

  TestAccountSeeder(JdbcClient jdbc, TransactionTemplate transaction, PasswordEncoder encoder) {
    this.jdbc = jdbc;
    this.transaction = transaction;
    this.encoder = encoder;
  }

  /** Seeds everything in one transaction; a failure leaves the database unchanged. */
  Result seed(SeedPasswords passwords) {
    return transaction.execute(status -> seedInTransaction(passwords));
  }

  private Result seedInTransaction(SeedPasswords passwords) {
    int accounts = 0;
    for (Account account : ACCOUNTS) {
      if (findAccount(account).isEmpty()) {
        jdbc.sql(
                """
                insert into users (id, email, password_hash, display_name, role)
                values (?, ?, ?, ?, ?)
                """)
            .params(
                UUID.randomUUID(),
                account.email(),
                encoder.encode(passwordOf(account, passwords)),
                account.displayName(),
                account.role())
            .update();
        accounts++;
      }
    }
    int classes = 0;
    for (ClassSeed classSeed : CLASSES) {
      classes +=
          jdbc.sql(
                  "insert into classes (id, name, invite_code) values (?, ?, ?)"
                      + " on conflict (id) do nothing")
              .params(classSeed.id(), classSeed.name(), inviteCode())
              .update();
      jdbc.sql("insert into class_tas (class_id, user_id) values (?, ?) on conflict do nothing")
          .params(classSeed.id(), idOf(classSeed.taEmail()))
          .update();
      for (String student : classSeed.studentEmails()) {
        jdbc.sql(
                "insert into class_members (class_id, user_id) values (?, ?)"
                    + " on conflict do nothing")
            .params(classSeed.id(), idOf(student))
            .update();
      }
    }
    return new Result(accounts, classes);
  }

  /** An existing account with another role is an operator error, not something to overwrite. */
  private Optional<UUID> findAccount(Account account) {
    Optional<Row> row =
        jdbc.sql("select id, role from users where lower(email) = lower(?)")
            .param(account.email())
            .query(Row.class)
            .optional();
    row.filter(r -> !r.role().equals(account.role()))
        .ifPresent(r -> {
          throw new IllegalStateException(
              account.email() + " already exists with role " + r.role());
        });
    return row.map(Row::id);
  }

  private UUID idOf(String email) {
    return jdbc.sql("select id from users where lower(email) = lower(?)")
        .param(email)
        .query(UUID.class)
        .single();
  }

  private static String passwordOf(Account account, SeedPasswords passwords) {
    return switch (account.role()) {
      case "ADMIN" -> passwords.admin();
      case "TA" -> passwords.ta();
      default -> passwords.student();
    };
  }

  /** Same shape as classes created through the API: 32 URL-safe characters. */
  private static String inviteCode() {
    byte[] bytes = new byte[24];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }
}
