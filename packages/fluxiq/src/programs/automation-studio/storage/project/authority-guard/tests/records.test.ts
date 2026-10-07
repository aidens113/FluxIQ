import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AutomationStudioProjectAuthorityGuardStore as Store } from "../index.ts";
const digest = `sha256:${"a".repeat(64)}`;
const request = { protocolVersion: 1 as const, projectId: "original-project", ownerKind: "flow", ownerId: "original-flow", operationKind: "flow.save", requestDigest: digest, expectedRevision: 0, operationKey: "original-operation" };
async function fixture(run: (store: Store, sql: import("../../database.ts").AutomationStudioSqlExecutor) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "authority-records-")), pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const store = await Store.open({ pool, projectId: request.projectId }), lease = await pool.acquire(request.projectId);
  try { await store.runLegacyMutation(request, async () => ({ value: null, resultDigest: digest })); await run(store, lease.database); }
  finally { await lease.release(); await store.close(); await pool.closeAll(); const resolved = path.resolve(root); if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("authority-records-")) throw new Error("Unsafe cleanup"); await rm(resolved, { recursive: true, force: true }); }
}
describe("authority guard durable record joins", () => {
  it.each(["owner_kind", "owner_id", "operation_kind", "request_digest", "status"])("refuses foreign completion mutation %s", async column => fixture(async (store, sql) => {
    await sql.run(`update mutation_records set ${column}=? where mutation_id=?`, [column === "status" ? "failed" : "foreign", "authority_guard:original-operation:legacy.complete"]);
    await expect(store.reconcileLegacy(request)).rejects.toThrow(); await expect(store.readState()).rejects.toThrow();
  }));
  it("refuses borrowed otherwise valid response from another operation", async () => fixture(async (store, sql) => {
    const second = { ...request, operationKey: "second-operation", expectedRevision: 1 };
    await store.runLegacyMutation(second, async () => ({ value: null, resultDigest: digest }));
    await sql.run("update mutation_records set response_json=(select response_json from mutation_records where mutation_id=?) where mutation_id=?", ["authority_guard:second-operation:legacy.complete", "authority_guard:original-operation:legacy.complete"]);
    await expect(store.reconcileLegacy(request)).rejects.toThrow();
  }));
  it("refuses missing historical receipt and wrong current head", async () => fixture(async (store, sql) => {
    await sql.run("update authority_guard_projects set revision=2 where project_id=?", [request.projectId]); await expect(store.readState()).rejects.toThrow();
    await sql.run("update authority_guard_projects set revision=1 where project_id=?", [request.projectId]);
    await sql.run("update authority_guard_legacy set completion_json=null where operation_key=?", [request.operationKey]); await expect(store.reconcileLegacy(request)).rejects.toThrow();
  }));
  it("verifies actual predecessor rather than a copied newer head", async () => fixture(async (store, sql) => {
    const second = { ...request, operationKey: "second-operation", expectedRevision: 1 };
    await store.runLegacyMutation(second, async () => ({ value: null, resultDigest: digest }));
    await sql.run("update authority_guard_legacy set predecessor_key=? where operation_key=?", ["foreign-key", second.operationKey]); await expect(store.reconcileLegacy(second)).rejects.toThrow();
    expect((await store.reconcileLegacy(request))?.completion?.completedRevision).toBe(1);
  }));
  it("refuses oversized and malformed immutable rows", async () => fixture(async (store, sql) => {
    await sql.run("update authority_guard_legacy set claim_json=? where operation_key=?", ["x".repeat(9000), request.operationKey]); await expect(store.reconcileLegacy(request)).rejects.toThrow();
  }));
});
