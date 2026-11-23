package com.leetkob.backend.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Component;

/** Issues the HS256 Bearer token of docs/contract/post-auth-login.md section 4. */
@Component
class TokenIssuer {

  static final Duration LIFETIME = Duration.ofHours(8);

  private final JwtEncoder encoder;
  private final Clock clock;

  TokenIssuer(JwtEncoder encoder, Clock clock) {
    this.encoder = encoder;
    this.clock = clock;
  }

  /** Returns a compact JWS with {@code sub}, {@code role}, {@code iat} and {@code exp}. */
  String issue(UUID userId, String role) {
    Instant now = clock.instant().truncatedTo(ChronoUnit.SECONDS);
    JwtClaimsSet claims =
        JwtClaimsSet.builder()
            .subject(userId.toString())
            .claim("role", role)
            .issuedAt(now)
            .expiresAt(now.plus(LIFETIME))
            .build();
    JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
    return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
  }
}
