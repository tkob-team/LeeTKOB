package com.leetkob.backend;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/** Test infrastructure: a PostgreSQL container and the fake JWT signing key. */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

  /** Fake signing key for tests only; at least 32 bytes as HS256 requires. */
  public static final String JWT_SECRET = "test-only-signing-key-not-a-real-secret-0123456789";

  @Bean
  @ServiceConnection
  PostgreSQLContainer postgresContainer() {
    return new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"));
  }

  @Bean
  DynamicPropertyRegistrar jwtSecretProperty() {
    return registry -> registry.add("leetkob.jwt.secret", () -> JWT_SECRET);
  }
}
