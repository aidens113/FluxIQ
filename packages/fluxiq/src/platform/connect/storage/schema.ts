export const CONNECT_CODE_SCHEMA = `create table if not exists connect_authorization_codes (
  code_digest text primary key not null check(length(code_digest) = 64),
  record_json text not null,
  expires_at integer not null check(expires_at >= 0),
  consumed_at integer null check(consumed_at is null or consumed_at >= 0)
)`;
