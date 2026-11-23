package com.leetkob.backend.seed;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * One-shot process started with {@code java -jar backend.jar seed}. It applies the Flyway
 * migrations, seeds the test accounts and exits. The HTTP application does not import it.
 */
@EnableAutoConfiguration
public class SeedApplication {

  private static final Logger LOG = LoggerFactory.getLogger(SeedApplication.class);

  /** Entry point used by {@code BackendApplication}; passwords come from the environment. */
  public static void start(String... args) {
    run(System.getenv(), args);
  }

  static TestAccountSeeder.Result run(Map<String, String> env, String... args) {
    // Check the passwords before touching the database, so a refused run writes nothing.
    SeedPasswords passwords = SeedPasswords.fromEnvironment(env);
    try (var context =
        new SpringApplicationBuilder(SeedApplication.class)
            .web(WebApplicationType.NONE)
            .run(args)) {
      var seeder =
          new TestAccountSeeder(
              context.getBean(JdbcClient.class),
              new TransactionTemplate(context.getBean(PlatformTransactionManager.class)),
              new BCryptPasswordEncoder());
      var result = seeder.seed(passwords);
      LOG.info(
          "event=seed_finished accountsCreated={} classesCreated={} accounts={}",
          result.accountsCreated(),
          result.classesCreated(),
          TestAccountSeeder.ACCOUNTS.stream().map(TestAccountSeeder.Account::email).toList());
      return result;
    }
  }
}
