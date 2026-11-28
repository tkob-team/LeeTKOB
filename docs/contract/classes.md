# Class management API — 1.2.0 (T29)

All endpoints require the existing valid HS256 Bearer JWT (`sub`, `role`, `exp`).
The user must exist and the signed global role must equal `users.role`; a missing
user or changed role returns 401. Identity and role cannot be selected in a body.
Unsupported HTTP methods return 405 with an Allow header describing the actual mapped methods.
Global roles are ADMIN, TA and STUDENT. T28 remains responsible for account
registration, password verification and issuing these tokens; this API does not
add a login screen or an alternative token issuer. User provisioning must set
`users.role` explicitly for administrators and TAs; migrated users default to STUDENT.

| Method/path | Who | Body | Success |
| --- | --- | --- | --- |
| POST `/classes` | ADMIN | `{"name":"Advanced Web"}` | 201 class object |
| GET `/classes` | Any authenticated user | — | 200 array; admin sees all, TA assigned classes, student joined classes |
| GET `/classes/{classId}` | ADMIN, assigned TA, joined student | — | 200 class object |
| POST `/classes/{classId}/tas` | ADMIN | `{"userId":"<existing TA UUID>"}` | 204, also on repeat |
| POST `/classes/join` | STUDENT | `{"inviteCode":"<32-character code>"}` | 200 class object, also on repeat |
| GET `/classes/{classId}/members` | ADMIN or assigned TA | — | 200 array of `{id, role}`; role is TA or STUDENT |
| GET `/admin/tas` | ADMIN | — | 200 array of `{id, email}` for every TA account, sorted by email (1.1.0) |
| GET `/admin/tas` | ADMIN | — | each item also carries `displayName` (1.2.0) |
| GET `/admin/classes` | ADMIN | — | 200 array of `{id, name, inviteCode, tas: [{id, email, displayName}], studentCount}` (1.2.0) |
| GET `/admin/classes/{classId}/members` | ADMIN | — | 200 array of `{id, role, email, displayName}`, TAs first, then by name (1.2.0) |

Class objects contain `id`, `name`, `inviteCode`. For students, inviteCode is null
(or omitted by JSON serialization), never the actual code. ADMIN and the assigned
TA may retrieve the code to invite students. Names are stripped and must contain
1–200 characters. IDs must parse as UUIDs. Invite codes are case-sensitive,
32-character base64url strings generated from 24 SecureRandom bytes (192 bits),
unique per class; they grant student membership only. Do not log invitation codes.
A newly created class returns its invitation immediately. Legacy classes have no
invitation; invitation rotation/recovery is a later extension.

TA assignment requires a persisted TA account. Unknown users and non-TA targets
return 400. Unknown classes return 404. Wrong global roles return 403. Class
outsiders receive 404, the same as a missing class; students cannot read rosters
(403). An invalid/missing name, UUID or invitation format returns 400; an unknown
well-formed invitation returns 404. Business failures use application/problem+json
with existing invalid-request/unauthenticated types or class-not-found and
class-access-denied types. Malformed HTTP bodies/media types use Spring MVC's
standard 400/415 responses. All denied operations leave membership unchanged.

Membership and assignment inserts use database uniqueness plus ON CONFLICT DO
NOTHING, so simultaneous retries cannot create duplicates. Student joins feed the
existing class_members table used by the submission endpoint: joining class A
never grants access to class B's labs. TA assignments are separate from student
membership and never grant submission rights. No passwords, invitations or account
creation fields are accepted as a way to elevate privileges.

Migration V2 extends V1 without changing it. Existing submission-contract tests
remain unchanged. ClassroomContractTest exercises real signed JWTs through HTTP
and real PostgreSQL: role boundaries, database role changes, cross-class access,
unknown/invalid input, duplicate and concurrent joins, spoofed identity fields,
and submission access before/after joining.

1.1.0 adds GET `/admin/tas` so the admin screen can pick a TA to assign. It lists
accounts whose `users.role` is TA, sorted by email (accounts without an email last,
then by id), and returns only `id` and `email`. TA and STUDENT receive 403
class-access-denied; a missing token, unknown user or changed role receives 401.
AdminTasContractTest covers these cases.

1.2.0 adds what the admin screens need to show people by name. GET `/admin/tas`
items gain `displayName` (null when the account has none). GET `/admin/classes`
returns every class in one call, sorted by name then id, with its invitation, its
TAs (`id`, `email`, `displayName`, sorted by display name, then email, then id;
empty array when none) and `studentCount`. GET `/admin/classes/{classId}/members`
returns the TAs first, then the students, each group sorted by display name, then
email, then id (null names and emails last); `role` is TA or STUDENT. An unknown
class returns 404 class-not-found and a malformed id 400 invalid-request. All three
are ADMIN only: TA and STUDENT receive 403 class-access-denied; a missing token,
unknown user or changed role receives 401.

GET `/classes/{classId}/members` stays `{id, role}` for the assigned TA (and admin):
the review queue shows students anonymously, and adding names or emails there would
let a TA map the ids seen elsewhere to real people. Names and emails of members are
therefore served only on the `/admin/` paths. AdminClassesContractTest covers the
three endpoints, the 403/401/404/400 cases, the orderings, and that the TA roster
still carries no email or displayName.
