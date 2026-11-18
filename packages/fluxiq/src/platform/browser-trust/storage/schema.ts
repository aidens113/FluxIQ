/** Private records and immutable workspace ownership are one authority; no second JSON trust index exists. */
export const CLIENT_TRUST_SCHEMA = [
  `create table if not exists browser_trust_workspaces (
    workspace_id text primary key not null,
    generation integer not null check (generation >= 0)
  )`,
  `create table if not exists browser_trust_records (
    trusted_client_id text primary key not null,
    workspace_id text not null references browser_trust_workspaces(workspace_id),
    client_json text not null,
    token_hash text not null,
    previous_token_hash text,
    present integer not null check (present in (0, 1))
  )`,
  "create index if not exists browser_trust_workspace_idx on browser_trust_records (workspace_id, present)",
  "create unique index if not exists browser_trust_token_idx on browser_trust_records (token_hash)",
  "create unique index if not exists browser_trust_previous_idx on browser_trust_records (previous_token_hash) where previous_token_hash is not null"
] as const;
