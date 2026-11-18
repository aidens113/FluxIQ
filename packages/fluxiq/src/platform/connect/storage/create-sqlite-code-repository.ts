import { timingSafeEqual } from "node:crypto";
import type { ConnectCodeRepository } from "../model/index.ts";
import { validateConnectCodeClaim, validateConnectCodeRecord } from "../model/index.ts";
import { connectCodeDatabaseExists, withConnectCodeDatabase } from "./database.ts";

type CodeRow = { code_digest: string; record_json: string; expires_at: number; consumed_at: number | null };

/** Persists only private digests/bindings, spending an authorization exactly once across restarts and processes. */
export function createSqliteConnectCodeRepository(options: { filePath: string }): ConnectCodeRepository {
  if (typeof options.filePath !== "string" || !options.filePath.trim()) throw new TypeError("A connect authorization database path is required.");
  const pending = new Set<Promise<unknown>>();
  let closed = false;
  async function track<T>(operation: () => Promise<T>): Promise<T> {
    if (closed) throw new Error("The connect authorization repository is closed.");
    const result = operation();
    pending.add(result);
    try {
      return await result;
    } finally {
      pending.delete(result);
    }
  }
  return {
    save: (input) => track(async () => {
      const record = validateConnectCodeRecord(input);
      await withConnectCodeDatabase(options.filePath, true, async (db) => {
        await db.run("delete from connect_authorization_codes where expires_at <= ?", [record.createdAt]);
        await db.run("insert into connect_authorization_codes (code_digest, record_json, expires_at, consumed_at) values (?, ?, ?, null)", [record.codeDigest, JSON.stringify(record), record.expiresAt]);
      });
    }),
    consume: (input) => track(async () => {
      const claim = validateConnectCodeClaim(input);
      if (!await connectCodeDatabaseExists(options.filePath)) return null;
      return withConnectCodeDatabase(options.filePath, false, async (db) => {
        const row = await db.get<CodeRow>("select code_digest, record_json, expires_at, consumed_at from connect_authorization_codes where code_digest = ?", [claim.codeDigest]);
        if (!row) return null;
        let parsed: unknown;
        try {
          parsed = JSON.parse(row.record_json);
        } catch {
          throw new Error("Connect authorization storage contains invalid evidence.");
        }
        const record = validateConnectCodeRecord(parsed);
        if (row.code_digest !== record.codeDigest || row.expires_at !== record.expiresAt) throw new Error("Connect authorization storage contains inconsistent evidence.");
        if (row.consumed_at !== null || record.expiresAt <= claim.now || record.createdAt > claim.now) return null;
        if (record.clientId !== claim.clientId || record.clientInstallId !== claim.clientInstallId || record.redirectUri !== claim.redirectUri) return null;
        if (!timingSafeEqual(Buffer.from(record.codeChallenge, "ascii"), Buffer.from(claim.codeChallenge, "ascii"))) return null;
        const changed = await db.run("update connect_authorization_codes set consumed_at = ? where code_digest = ? and consumed_at is null", [claim.now, claim.codeDigest]);
        if (changed !== 1) throw new Error("Connect authorization consumption lost its transaction.");
        return record;
      });
    }),
    close: async () => {
      closed = true;
      const results = await Promise.allSettled([...pending]);
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length) throw new AggregateError(failures.map((result) => result.reason), "Connect authorization operations failed while closing.");
    }
  };
}
