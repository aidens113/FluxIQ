import type { EnrolledKeyRecord, KeySessionLookup } from "../model/index.ts";
import type { KeyDatabase } from "./database.ts";

import { KEY_COLUMNS } from "./key-columns.ts";

export async function readActiveKeySession(db: KeyDatabase, tokenDigest: string, nowMs: number): Promise<KeySessionLookup | null> {
  const session = await db.get<KeySessionLookup["session"]>(
    "select token_digest as tokenDigest, key_id as keyId, audience, created_at_ms as createdAtMs, expires_at_ms as expiresAtMs, revoked_at_ms as revokedAtMs, last_used_at_ms as lastUsedAtMs from key_sessions where token_digest = ? and revoked_at_ms is null and created_at_ms <= ? and expires_at_ms > ?",
    [tokenDigest, nowMs, nowMs]
  );
  if (!session) return null;
  const key = await db.get<EnrolledKeyRecord>(`select ${KEY_COLUMNS} from enrolled_keys where key_id = ? and revoked_at_ms is null`, [session.keyId]);
  return key ? { key, session } : null;
}
