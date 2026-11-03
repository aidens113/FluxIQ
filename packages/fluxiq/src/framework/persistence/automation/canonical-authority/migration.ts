/** Same physical global canonical database; schema installation grants no owner. */
export const CANONICAL_AUTHORITY_SCHEMA = [
  "create table if not exists canonical_authority_config (singleton integer primary key check(singleton=1), protocol_version integer not null check(protocol_version=1), mode text not null check(mode in ('legacy','routing')))",
  "create table if not exists canonical_authority_owners (kind text not null check(kind in ('automation.flows','automation.flow_publications')), resource_id text not null, original_project_id text not null, owner_revision integer not null check(owner_revision>=0), tombstoned integer not null check(tombstoned in (0,1)), primary key(kind,resource_id))",
  "create table if not exists canonical_authority_operations (operation_key text primary key, request_json text not null, claim_digest text not null, original_project_id text not null, phase text not null check(phase in ('reserved','project_claimed','effect_applied','completed','unknown')), project_request_json text, project_claim_digest text, effect_json text, project_receipt_json text)",
  "create table if not exists canonical_authority_project_fences (original_project_id text primary key, revision integer not null check(revision>=0), mode text not null check(mode in ('routing','capturing')), capture_key text)",
  "create table if not exists canonical_authority_captures (capture_key text primary key, original_project_id text not null, request_json text not null, capture_digest text not null, project_request_json text, project_capture_digest text, phase text not null check(phase in ('global_fenced','project_fenced','unknown')))",
  "insert or ignore into canonical_authority_config values(1,1,'legacy')"
];
