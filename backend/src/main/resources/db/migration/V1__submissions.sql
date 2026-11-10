create table users (
  id uuid primary key
);

create table classes (
  id uuid primary key,
  name text not null
);

create table class_members (
  class_id uuid not null references classes (id),
  user_id uuid not null references users (id),
  primary key (class_id, user_id)
);

create table labs (
  id uuid primary key,
  class_id uuid not null references classes (id),
  opens_at timestamptz not null,
  due_at timestamptz not null,
  check (opens_at < due_at)
);

create table submissions (
  id uuid primary key,
  lab_id uuid not null references labs (id),
  student_id uuid not null references users (id),
  idempotency_key varchar(64) not null,
  code text not null,
  size_bytes integer not null,
  submitted_at timestamptz not null,
  unique (student_id, idempotency_key)
);
