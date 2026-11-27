package com.leetkob.backend.seed;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;

/** Seeds a fixed-size set of scoped synthetic students in one transaction. */
final class LoadAccountSeeder {
  private static final int STUDENTS = 80;
  private final JdbcClient jdbc;
  private final TransactionTemplate transaction;
  private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

  LoadAccountSeeder(JdbcClient jdbc, TransactionTemplate transaction) {
    this.jdbc = jdbc;
    this.transaction = transaction;
  }

  int seed(UUID classId, String secret) {
    return transaction.execute(status -> seedClass(classId, secret));
  }

  private int seedClass(UUID classId, String secret) {
    jdbc.sql("select id from classes where id = ? for update")
        .param(classId)
        .query(UUID.class)
        .single();
    int created = 0;
    for (int student = 1; student <= STUDENTS; student++) {
      String address = "load-" + classId + "-" + student + "@leetkob.test";
      String password = password(address, secret);
      var existing =
          jdbc.sql("select id, role, password_hash from users where email = ?")
              .param(address)
              .query(Account.class)
              .optional();
      UUID id;
      if (existing.isPresent()) {
        var account = existing.get();
        if (!"STUDENT".equals(account.role())
            || !encoder.matches(password, account.passwordHash())) {
          throw new IllegalStateException(
              "Existing load account has a different role or seed secret.");
        }
        id = account.id();
      } else {
        id = UUID.randomUUID();
        jdbc.sql(
                "insert into users (id, email, role, password_hash, display_name)"
                    + " values (?, ?, 'STUDENT', ?, ?)")
            .params(id, address, encoder.encode(password), "Load student " + student)
            .update();
        created++;
      }
      jdbc.sql("insert into class_members (class_id, user_id) values (?, ?) on conflict do nothing")
          .params(classId, id)
          .update();
    }
    return created;
  }

  private static String password(String address, String secret) {
    try {
      var hmac = Mac.getInstance("HmacSHA256");
      hmac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return HexFormat.of().formatHex(hmac.doFinal(address.getBytes(StandardCharsets.UTF_8)));
    } catch (GeneralSecurityException error) {
      throw new IllegalStateException("Could not derive the fixture credential.", error);
    }
  }

  private record Account(UUID id, String role, String passwordHash) {}
}
