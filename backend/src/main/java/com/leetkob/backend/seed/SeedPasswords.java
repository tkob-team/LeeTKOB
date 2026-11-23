package com.leetkob.backend.seed;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Map;

/**
 * Passwords of the seeded test accounts, one per role, read from environment variables. Values are
 * never printed; error messages name the variable only.
 */
record SeedPasswords(String admin, String ta, String student) {

  static final String ADMIN = "SEED_ADMIN_PASSWORD";
  static final String TA = "SEED_TA_PASSWORD";
  static final String STUDENT = "SEED_STUDENT_PASSWORD";

  /** At least this many characters, so a deployment never runs with a short guessable value. */
  static final int MIN_LENGTH = 12;

  /** BCrypt and {@code POST /auth/login} read at most 72 bytes. */
  static final int MAX_BYTES = 72;

  @Override
  public String toString() {
    return "SeedPasswords[redacted]";
  }

  static SeedPasswords fromEnvironment(Map<String, String> env) {
    var problems = new ArrayList<String>();
    String admin = read(env, ADMIN, problems);
    String ta = read(env, TA, problems);
    String student = read(env, STUDENT, problems);
    if (!problems.isEmpty()) {
      throw new IllegalArgumentException("Seed refused: " + String.join("; ", problems));
    }
    return new SeedPasswords(admin, ta, student);
  }

  private static String read(Map<String, String> env, String name, ArrayList<String> problems) {
    String value = env.get(name);
    if (value == null || value.isBlank()) {
      problems.add(name + " is not set");
    } else if (value.length() < MIN_LENGTH) {
      problems.add(name + " must have at least " + MIN_LENGTH + " characters");
    } else if (value.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
      problems.add(name + " must be at most " + MAX_BYTES + " bytes in UTF-8");
    }
    return value;
  }
}
