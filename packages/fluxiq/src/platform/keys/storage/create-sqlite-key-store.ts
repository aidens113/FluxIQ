import path from "node:path";
import type { EnrolledKeyRecord, KeyStore } from "../model/index.ts";
import { createKeyDatabase } from "./database.ts";
import { readActiveKeySession } from "./read-active-key-session.ts";
import { KEY_COLUMNS } from "./key-columns.ts";

/** Dedicated durable auth tables at the caller's explicitly configured file path. No private keys or raw bearers are stored. */
export function createSQLiteKeyStore(options: { filePath: string }): KeyStore {
  if (typeof options.filePath !== "string" || options.filePath.trim() === "" || options.filePath === ":memory:") throw new TypeError("A durable key database path is required.");
  const filePath = path.resolve(options.filePath);
  const database = createKeyDatabase(filePath);
  return {
    close: () => database.close(),
    enroll: (record) => database.transaction(async (db) => {
      await db.run(
        "insert into enrolled_keys (key_id, public_key, user_id, workspace_id, created_at_ms, revoked_at_ms, last_used_at_ms) values (?, ?, ?, ?, ?, ?, ?) on conflict(key_id) do nothing",
        [record.keyId, record.publicKey, record.userId, record.workspaceId, record.createdAtMs, record.revokedAtMs, record.lastUsedAtMs]
      );
      const saved = await db.get<EnrolledKeyRecord>(`select ${KEY_COLUMNS} from enrolled_keys where key_id = ?`, [record.keyId]);
      if (!saved || saved.revokedAtMs !== null || saved.publicKey !== record.publicKey || saved.userId !== record.userId || saved.workspaceId !== record.workspaceId) return null;
      return saved;
    }),
    getKey: (keyId) => database.transaction(async (db) => (await db.get<EnrolledKeyRecord>(`select ${KEY_COLUMNS} from enrolled_keys where key_id = ?`, [keyId])) ?? null),
    listKeys: (binding) => database.transaction((db) => db.all<EnrolledKeyRecord>(`select ${KEY_COLUMNS} from enrolled_keys where user_id = ? and workspace_id = ? order by created_at_ms desc, key_id`, [binding.userId, binding.workspaceId])),
    issue: (input) => database.transaction(async (db) => {
      const key = await db.get<EnrolledKeyRecord>(`select ${KEY_COLUMNS} from enrolled_keys where key_id = ? and revoked_at_ms is null`, [input.keyId]);
      if (!key || input.session.keyId !== input.keyId) return "revoked";
      await db.run("delete from proof_nonces where expires_at_ms <= ?", [input.session.createdAtMs]);
      const consumed = await db.run(
        "insert into proof_nonces (key_id, nonce_digest, expires_at_ms) values (?, ?, ?) on conflict(key_id, nonce_digest) do nothing",
        [input.keyId, input.nonceDigest, input.nonceExpiresAtMs]
      );
      if (consumed !== 1) return "replayed";
      await db.run(
        "insert into key_sessions (token_digest, key_id, audience, created_at_ms, expires_at_ms, revoked_at_ms, last_used_at_ms) values (?, ?, ?, ?, ?, null, null)",
        [input.session.tokenDigest, input.keyId, input.session.audience, input.session.createdAtMs, input.session.expiresAtMs]
      );
      await db.run("update enrolled_keys set last_used_at_ms = max(coalesce(last_used_at_ms, 0), ?) where key_id = ?", [input.session.createdAtMs, input.keyId]);
      return "issued";
    }),
    findSession: (tokenDigest, nowMs) => database.transaction((db) => readActiveKeySession(db, tokenDigest, nowMs)),
    touchSession: (tokenDigest, nowMs) => database.transaction(async (db) => {
      const found = await readActiveKeySession(db, tokenDigest, nowMs);
      if (!found) return null;
      await db.run("update key_sessions set last_used_at_ms = max(coalesce(last_used_at_ms, 0), ?) where token_digest = ?", [nowMs, tokenDigest]);
      await db.run("update enrolled_keys set last_used_at_ms = max(coalesce(last_used_at_ms, 0), ?) where key_id = ?", [nowMs, found.key.keyId]);
      return found;
    }),
    revokeKey: (keyId, nowMs) => database.transaction(async (db) => {
      const changed = await db.run("update enrolled_keys set revoked_at_ms = ? where key_id = ? and revoked_at_ms is null", [nowMs, keyId]);
      await db.run("update key_sessions set revoked_at_ms = ? where key_id = ? and revoked_at_ms is null", [nowMs, keyId]);
      return changed > 0;
    }),
    revokeSession: (tokenDigest, nowMs) => database.transaction(async (db) => {
      return (await db.run("update key_sessions set revoked_at_ms = ? where token_digest = ? and revoked_at_ms is null", [nowMs, tokenDigest])) > 0;
    })
  };
}
