/** Kept separate from account records: these tables hold authentication material. */
export const KEY_STORE_SCHEMA = [
  `create table if not exists enrolled_keys (
    key_id text primary key,
    public_key text not null,
    user_id text not null,
    workspace_id text not null,
    created_at_ms integer not null,
    revoked_at_ms integer,
    last_used_at_ms integer
  )`,
  `create table if not exists key_sessions (
    token_digest text primary key,
    key_id text not null references enrolled_keys(key_id),
    audience text not null,
    created_at_ms integer not null,
    expires_at_ms integer not null,
    revoked_at_ms integer,
    last_used_at_ms integer
  )`,
  "create index if not exists key_sessions_key on key_sessions(key_id)",
  `create table if not exists proof_nonces (
    key_id text not null references enrolled_keys(key_id),
    nonce_digest text not null,
    expires_at_ms integer not null,
    primary key (key_id, nonce_digest)
  )`,
  "create index if not exists proof_nonces_expiry on proof_nonces(expires_at_ms)"
];
