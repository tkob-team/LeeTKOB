-- Existing submission fixtures/accounts remain students unless explicitly provisioned otherwise.
alter table users add column role text not null default 'STUDENT'
  check (role in ('ADMIN', 'TA', 'STUDENT'));

-- Legacy classes have no invitation until an administrator provisions one.
alter table classes add column invite_code varchar(32) unique;

create table class_tas (
  class_id uuid not null references classes (id),
  user_id uuid not null references users (id),
  primary key (class_id, user_id)
);
