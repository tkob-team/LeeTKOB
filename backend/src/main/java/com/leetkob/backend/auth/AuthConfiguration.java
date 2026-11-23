package com.leetkob.backend.auth;

import java.nio.charset.StandardCharsets;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

/** The password hash and the token signer of {@code POST /auth/login}. */
@Configuration
class AuthConfiguration {

  @Bean
  PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  /** Signs with the same HS256 key the resource-server decoder verifies with. */
  @Bean
  JwtEncoder jwtEncoder(@Value("${leetkob.jwt.secret}") String secret) {
    return NimbusJwtEncoder.withSecretKey(
            new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"))
        .algorithm(MacAlgorithm.HS256)
        .build();
  }
}
