package com.leetkob.backend.security;

import com.leetkob.backend.problem.ApiException;
import com.leetkob.backend.problem.ProblemType;
import com.leetkob.backend.problem.Problems;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Set;
import java.util.regex.Pattern;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.ResponseEntity;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;

/** Stateless Bearer JWT (HS256) authentication; every failure is a 401 problem. */
@Configuration
class SecurityConfiguration {

  private static final Pattern UUID_FORMAT =
      Pattern.compile(
          "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
  private static final Set<String> ROLES = Set.of("ADMIN", "TA", "STUDENT");

  @Bean
  SecurityFilterChain filterChain(HttpSecurity http, Problems problems) throws Exception {
    AuthenticationEntryPoint entryPoint =
        (request, response, exception) -> {
          ResponseEntity<byte[]> problem =
              problems.response(
                  new ApiException(
                      ProblemType.UNAUTHENTICATED, "A valid Bearer token is required."),
                  request.getRequestURI());
          response.setStatus(problem.getStatusCode().value());
          problem
              .getHeaders()
              .forEach((name, values) -> values.forEach(v -> response.addHeader(name, v)));
          response.getOutputStream().write(problem.getBody());
        };
    http.csrf(AbstractHttpConfigurer::disable)
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(a -> a.anyRequest().authenticated())
        .exceptionHandling(e -> e.authenticationEntryPoint(entryPoint))
        .oauth2ResourceServer(
            o -> o.jwt(Customizer.withDefaults()).authenticationEntryPoint(entryPoint));
    return http.build();
  }

  @Bean
  JwtDecoder jwtDecoder(@Value("${leetkob.jwt.secret}") String secret) {
    NimbusJwtDecoder decoder =
        NimbusJwtDecoder.withSecretKey(
                new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"))
            .macAlgorithm(MacAlgorithm.HS256)
            .build();
    JwtTimestampValidator timestamps = new JwtTimestampValidator(Duration.ZERO);
    timestamps.setAllowEmptyExpiryClaim(false);
    decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(timestamps, claimsValidator()));
    return decoder;
  }

  private static OAuth2TokenValidator<Jwt> claimsValidator() {
    return jwt -> {
      String subject = jwt.getSubject();
      String role = jwt.getClaimAsString("role");
      if (subject == null
          || !UUID_FORMAT.matcher(subject).matches()
          || role == null
          || !ROLES.contains(role)) {
        return OAuth2TokenValidatorResult.failure(
            new OAuth2Error("invalid_token", "Missing or invalid sub or role claim.", null));
      }
      return OAuth2TokenValidatorResult.success();
    };
  }
}
