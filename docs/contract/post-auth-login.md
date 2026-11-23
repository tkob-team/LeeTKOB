# Contract: `POST /auth/login`

Status: 1.0.0 (PA#03). Source of truth for this endpoint: code and tests must follow this file. The tokens it issues are the Bearer tokens every other contract accepts (see [the intake contract](post-labs-submissions.md), section 1).

A user signs in with email and password and receives a signed JWT, their role and their
display name. The browser keeps the token and sends it as `Authorization: Bearer <JWT>` to
the other endpoints.

## 1. Who may call it

| Caller | Result |
| --- | --- |
| Anyone, with or without a token | The endpoint is public. An `Authorization` header is not needed and should not be sent. |
| Too many failed attempts for the email or from the client address (section 3) | 429 `too-many-attempts` |
| Unknown email, wrong password, or an account without a password | 401 `invalid-credentials`, the same response in every case |
| Known email with the matching password, any role (`ADMIN`, `TA`, `STUDENT`) | 200 |

## 2. Request

```
POST /auth/login
Content-Type: application/json

{ "email": "ta01@truong.edu.vn", "password": "correct horse battery staple" }
```

| Part | Rule |
| --- | --- |
| `Content-Type` | `application/json`, no charset or `charset=UTF-8`. Otherwise 415 `unsupported-media-type`. |
| Body | One JSON object of at most 4096 bytes in UTF-8 with exactly the fields below. Otherwise 400 `invalid-request`. |
| `email` | Required string, not blank after trimming, at most 254 characters. Matched against `users.email` after trimming, ignoring case. |
| `password` | Required string, not empty, at most 72 bytes in UTF-8 (the BCrypt limit). Compared as sent, never trimmed. |

## 3. Rules and order of checks

1. `Content-Type` (415).
2. Body and fields (400 `invalid-request` with `errors[]` naming the field). A rejected body is
   not a login attempt and is not counted.
3. Attempt limit (429). Failed attempts are counted per email (trimmed, lower case) and per
   client address (the TCP peer address; `X-Forwarded-For` is not trusted). Within a window
   of 15 minutes from the first counted failure, the 6th attempt for the same email and the
   21st attempt from the same address are refused with 429 and a `Retry-After` header (whole
   seconds until the window ends). A refused attempt does not check the password, so a correct
   password is refused too. Unknown emails are counted like known ones, so a 429 does not
   reveal whether an email exists.
4. Credentials (401). The password is compared with `users.password_hash` using BCrypt. When
   the email is unknown or the hash is null, a BCrypt comparison against a fixed dummy hash still
   runs so the response time does not reveal whether the email exists. Every failure in this
   step returns the same body and counts as one failed attempt for the email and the address.
5. Success (200). The failure count for the email is cleared; the count for the address is kept.

## 4. Responses

### 200 OK

```
Content-Type: application/json
Cache-Control: no-store

{
  "token": "<compact JWS: header.payload.signature>",
  "role": "TA",
  "displayName": "Thay Ta"
}
```

| Field | Type | Rule |
| --- | --- | --- |
| `token` | string | Compact JWS, see below. |
| `role` | string | `ADMIN`, `TA` or `STUDENT`, from `users.role`. Same value as the token's `role` claim. |
| `displayName` | string or null | `users.display_name`; null when not set. |

The token:

| Part | Value |
| --- | --- |
| Header `alg` | `HS256`, signed with the key from the `JWT_SECRET` environment variable (the same key the verifier uses). |
| `sub` | The user's id (UUID, lower case). |
| `role` | The user's role at sign-in. Endpoints compare it with `users.role` and answer 401 when it changed. |
| `iat` | Issue time, seconds since the epoch. |
| `exp` | `iat` + 8 hours. The verifier rejects expired tokens without clock-skew grace. |

There is no refresh token and no server-side session. Signing out is done by the client
discarding the token; a token stays valid until `exp`.

### Errors (RFC 9457)

Every error is `application/problem+json` with `type`, `title`, `status`, `detail` and
`instance`, as in [the intake contract](post-labs-submissions.md). Clients branch on `type`.

| `type` | Status | Title | When |
| --- | --- | --- | --- |
| `urn:leetkob:problem:invalid-request` | 400 | Invalid request | Section 2 body or field rules. |
| `urn:leetkob:problem:invalid-credentials` | 401 | Email or password is incorrect | Section 3 step 4. No `WWW-Authenticate` header, since this is not a Bearer challenge. The `detail` is the same for every cause. |
| `urn:leetkob:problem:method-not-allowed` | 405 | Method not allowed | Other HTTP methods (also sends `Allow: POST`). |
| `urn:leetkob:problem:unsupported-media-type` | 415 | Unsupported media type | Section 2 `Content-Type`. |
| `urn:leetkob:problem:too-many-attempts` | 429 | Too many sign-in attempts | Section 3 step 3. Sends `Retry-After`. |
| `urn:leetkob:problem:internal-error` | 500 | Internal error | Unexpected failure. |

## 5. Data the contract assumes

`users.email` (unique, nullable), `users.password_hash` (BCrypt, nullable), `users.role` and
`users.display_name`, from migrations V2 and V4. This endpoint only reads `users`. Accounts and
their password hashes are created outside this contract (seed scripts for now).

## 6. Changing this contract

The rules of [the intake contract](post-labs-submissions.md#7-changing-this-contract) apply.

### Changelog

| Version | Change |
| --- | --- |
| 1.0.0 | First version (T81). |

## 7. Contract tests this file requires

`backend/src/test/java/com/leetkob/backend/auth/AuthLoginContractTest.java`:

| Test | Rule |
| --- | --- |
| `correctPasswordIssuesVerifiableToken` | Section 4 200 shape; token `sub`, `role`, `exp` = `iat` + 8 h, accepted by the verifier. |
| `wrongPasswordIsRejected` | Section 3 step 4: 401 `invalid-credentials`. |
| `unknownEmailGetsTheSameResponseAsWrongPassword` | Section 3 step 4: identical status and body for unknown email, wrong password and an account without a password. |
| `issuedTokenCallsExistingEndpointsByRole` | A TA token reads the review queue, a student token gets 403 there and reads `/student/labs`. |
| `repeatedFailuresForAnEmailAreLimited` | Section 3 step 3: 429 with `Retry-After` after 5 failures, also for the correct password; other emails still work. |
| `repeatedFailuresFromAnAddressAreLimited` | Section 3 step 3: 429 after 20 failures from one address over different emails; another address still works. |
| `invalidBodyIsRejected` | Section 2: 400 with field errors, 415 for another content type. |
| `otherMethodsAreNotAllowed` | Section 4: 405 with `Allow: POST`. |

`backend/src/test/java/com/leetkob/backend/auth/LoginAttemptsTest.java` checks the window
with a fixed clock: the count resets after 15 minutes and `Retry-After` counts down.

## 8. Scope

- **No account creation, password change or reset.** Those are later contracts.
- **The attempt limit is per backend process and kept in memory.** A restart clears it; with
  several instances each keeps its own count. Good enough for one instance in PA#03.
- **No token revocation.** Changing a user's role invalidates their old tokens through the
  role check of the other endpoints; nothing else does before `exp`.
