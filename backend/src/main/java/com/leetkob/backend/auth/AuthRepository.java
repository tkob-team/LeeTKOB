package com.leetkob.backend.auth;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads the account a sign-in names; this endpoint never writes {@code users}. */
@Repository
class AuthRepository {

  /** An account; {@code passwordHash} and {@code displayName} may be null. */
  record Account(UUID id, String passwordHash, String role, String displayName) {}

  private final JdbcClient jdbc;

  AuthRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  /** Finds the account whose email equals {@code email}, ignoring case. */
  Optional<Account> byEmail(String email) {
    return jdbc.sql(
            """
            select id, password_hash, role, display_name from users
            where lower(email) = lower(?)
            """)
        .param(email)
        .query(Account.class)
        .optional();
  }
}
