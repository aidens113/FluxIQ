import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ClientGatewayCommandLedgerController as Controller, type ClientGatewayCommandClaim } from "../../../../../../client-gateway/service/command-ledger/index.ts";
import { AutomationStudioProjectCommandLedgerStore as Store } from "../index.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AutomationStudioProjectAcceptedStateStore } from "../../accepted-state/index.ts";
import { AutomationStudioCandidateVerificationStore } from "../../candidate-verification/index.ts";
import { AutomationStudioProjectFlowResourceRepository } from "../../flow-resource-repository.ts";

function claim(invocationId = "invoke.1"): ClientGatewayCommandClaim {
  const owner = { projectId: "project.1", runId: "run.1", flowId: "flow.1", invocationId, attemptId: "node.attempt.1", effectOrdinal: 0 };
  return { binding: { schemaVersion: "gateway_command.v1", ...owner, commandId: Controller.commandId(owner), clientId: "client.1", sessionId: "session.1" }, requestDigest: `sha256:${"a".repeat(64)}` };
}
function receipt(input = claim()) { return { schemaVersion: "gateway_command_receipt.v1" as const, commandId: input.binding.commandId, requestDigest: input.requestDigest, clientId: input.binding.clientId, sessionId: input.binding.sessionId, status: "succeeded" as const, receivedAt: Date.now(), resultDigest: `sha256:${"b".repeat(64)}`, redaction: "receipt_only" as const }; }
async function removeOwned(root: string) {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("gateway-ledger-")) throw new Error("Refusing cleanup outside owned gateway fixture");
  await rm(resolved, { recursive: true, force: true });
}
async function fixture(operation: (store: Store, pool: AutomationStudioProjectDatabasePool, root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "gateway-ledger-")), pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const store = await Store.open({ pool, projectId: "project.1" });
  try { await operation(store, pool, root); } finally { vi.restoreAllMocks(); await store.close(); await pool.closeAll(); await removeOwned(root); }
}
describe("real project SQL command receipt infrastructure", () => {
  it("commits claim before send, excludes raw values, and restores receipt without replay or usable payload", async () => fixture(async (store, pool, root) => {
    const input = claim(), sends: string[] = [];
    const live = await new Controller(store).dispatch(input, async () => {
      expect((await store.read(input))?.state).toBe("pending"); sends.push("effect");
      return { result: { privatePage: "never-store-this-value" }, receipt: receipt(input) };
    });
    expect(live).toMatchObject({ status: "completed", result: { privatePage: "never-store-this-value" } });
    const secondPool = new AutomationStudioProjectDatabasePool({ rootDir: root }), reopened = await Store.open({ pool: secondPool, projectId: "project.1" });
    try {
      const result = await new Controller(reopened).dispatch(input, async () => { sends.push("repeat"); throw new Error("unexpected send"); });
      expect(result.status).toBe("result_unavailable"); expect(sends).toEqual(["effect"]);
      const lease = await pool.acquire("project.1");
      try { const rows = await lease.database.all("select * from gateway_command_claims union all select command_id,receipt_json,proof_digest,committed_at_ms from gateway_command_receipts"); expect(JSON.stringify(rows)).not.toContain("never-store-this-value"); expect(JSON.stringify(await lease.database.all("select * from mutation_records"))).not.toContain("never-store-this-value"); } finally { await lease.release(); }
    } finally { await reopened.close(); await secondPool.closeAll(); }
  }));
  it("two separate SQL owners grant only one send claim", async () => fixture(async (store, _pool, root) => {
    const secondPool = new AutomationStudioProjectDatabasePool({ rootDir: root }), other = await Store.open({ pool: secondPool, projectId: "project.1" });
    try {
      const results = await Promise.all([store.claim(claim()), other.claim(claim())]); expect(results.filter(result => result.sendAllowed)).toHaveLength(1);
      expect(await other.claim(claim())).toMatchObject({ sendAllowed: false, record: { state: "pending" } });
    } finally { await other.close(); await secondPool.closeAll(); }
  }));
  it("refuses changed payload, session, client and project under stable key", async () => fixture(async store => {
    const input = claim(); await store.claim(input);
    for (const changed of [{ ...input, requestDigest: `sha256:${"c".repeat(64)}` }, { ...input, binding: { ...input.binding, sessionId: "other.session" } }, { ...input, binding: { ...input.binding, clientId: "other.client" } }]) {
      expect(changed.binding.commandId).toBe(input.binding.commandId); await expect(store.claim(changed)).rejects.toThrow(); await expect(store.read(changed)).rejects.toThrow();
    }
    await expect(store.claim({ ...input, binding: { ...input.binding, projectId: "project.other" } })).rejects.toThrow();
    await expect(store.commitReceipt(input, { ...receipt(input), sessionId: "other.session" })).rejects.toThrow();
  }));
  it("rolls back failed claim before send and preserves zero effects", async () => fixture(async (store, pool) => {
    const lease = await pool.acquire("project.1"), send = vi.fn();
    try {
      await lease.database.run("create trigger reject_gateway_claim before insert on gateway_command_claims begin select raise(abort,'claim fixture abort'); end");
      await expect(new Controller(store).dispatch(claim(), send)).rejects.toThrow("claim fixture abort"); expect(send).not.toHaveBeenCalled();
      expect(await lease.database.get("select count(*) as n from gateway_command_claims")).toEqual({ n: 0 }); expect(await store.read(claim())).toBeNull();
      await lease.database.run("drop trigger reject_gateway_claim"); await expect(store.claim(claim())).rejects.toThrow("failed");
    } finally { await lease.release(); }
  }));
  it("failed receipt commit after synthetic effect remains unknown and never resends on reopen", async () => fixture(async (store, pool, root) => {
    const lease = await pool.acquire("project.1"), sends: number[] = [];
    try {
      await lease.database.run("create trigger reject_gateway_receipt before insert on gateway_command_receipts begin select raise(abort,'receipt fixture abort'); end");
      expect(await new Controller(store).dispatch(claim(), async () => { sends.push(1); return { result: "live", receipt: receipt() }; })).toEqual({ status: "outcome_unknown" });
      expect((await store.read(claim()))?.state).toBe("unknown"); expect(await lease.database.get("select count(*) as n from gateway_command_receipts")).toEqual({ n: 0 });
      await lease.database.run("drop trigger reject_gateway_receipt");
      const secondPool = new AutomationStudioProjectDatabasePool({ rootDir: root }), reopened = await Store.open({ pool: secondPool, projectId: "project.1" });
      try { expect(await new Controller(reopened).dispatch(claim(), async () => { sends.push(2); throw new Error("repeat"); })).toEqual({ status: "outcome_unknown" }); expect(sends).toEqual([1]); } finally { await reopened.close(); await secondPool.closeAll(); }
    } finally { await lease.release(); }
  }));
  it("actual SQL COMMIT followed by lost acknowledgement reconciles immutable receipt", async () => fixture(async (store, pool, root) => {
    await store.claim(claim()); const ack = receipt(), lease = await pool.acquire("project.1");
    try {
      const original = lease.database.transaction.bind(lease.database); let lose = true;
      vi.spyOn(lease.database, "transaction").mockImplementation(async operation => { const result = await original(operation); if (lose) { lose = false; throw new Error("lost COMMIT acknowledgement"); } return result; });
      await expect(store.commitReceipt(claim(), ack)).rejects.toThrow("lost COMMIT acknowledgement"); vi.restoreAllMocks();
      const secondPool = new AutomationStudioProjectDatabasePool({ rootDir: root }), reopened = await Store.open({ pool: secondPool, projectId: "project.1" });
      try { expect(await reopened.read(claim())).toMatchObject({ state: "committed", receipt: ack }); expect(await reopened.claim(claim())).toMatchObject({ sendAllowed: false }); expect((await reopened.commitReceipt(claim(), ack)).receipt).toEqual(ack); } finally { await reopened.close(); await secondPool.closeAll(); }
    } finally { await lease.release(); }
  }));
  it("committed result wins over unknown and duplicates must match exactly", async () => fixture(async store => {
    const input = claim(); await store.claim(input); await store.markUnknown(input, "timeout"); const ack = receipt(input); await store.commitReceipt(input, ack);
    expect((await store.markUnknown(input, "disconnected")).state).toBe("committed"); expect((await store.commitReceipt(input, ack)).receipt).toEqual(ack);
    await expect(store.commitReceipt(input, { ...ack, resultDigest: `sha256:${"d".repeat(64)}` })).rejects.toThrow();
  }));
  it.each(["owner_kind", "owner_id", "operation_kind", "request_digest", "status"])("refuses corrupt durable %s on replay and reconciliation", async field => fixture(async (store, pool) => {
    const input = claim(); await store.claim(input); const lease = await pool.acquire("project.1");
    try {
      await lease.database.run(`update mutation_records set ${field}=? where mutation_id=?`, [field === "request_digest" ? `sha256:${"d".repeat(64)}` : field === "status" ? "failed" : "foreign", `${input.binding.commandId}.claim`]);
      await expect(store.read(input)).rejects.toThrow("corrupt_mutation_join"); await expect(store.claim(input)).rejects.toThrow();
    } finally { await lease.release(); }
  }));
  it("rejects borrowed valid receipt/proof and changed immutable claim content", async () => fixture(async (store, pool) => {
    const first = claim(), second = claim("invoke.2"); await store.claim(first); await store.claim(second); await store.commitReceipt(first, receipt(first)); await store.commitReceipt(second, receipt(second));
    const lease = await pool.acquire("project.1");
    try {
      const borrowed = await lease.database.get<{ response_json: string }>("select response_json from mutation_records where mutation_id=?", [`${second.binding.commandId}.receipt`]);
      await lease.database.run("update mutation_records set response_json=? where mutation_id=?", [borrowed!.response_json, `${first.binding.commandId}.receipt`]); await expect(store.read(first)).rejects.toThrow("corrupt_mutation_join");
      await lease.database.run("update gateway_command_claims set claim_json=? where command_id=?", [JSON.stringify({ ...second, requestDigest: `sha256:${"f".repeat(64)}` }), second.binding.commandId]); await expect(store.read(second)).rejects.toThrow();
    } finally { await lease.release(); }
  }));
  it("refuses deleted historical receipt despite a still-committed mutation", async () => fixture(async (store, pool) => {
    await store.claim(claim()); await store.commitReceipt(claim(), receipt()); const lease = await pool.acquire("project.1");
    try { await lease.database.run("delete from gateway_command_receipts"); await expect(store.read(claim())).rejects.toThrow("missing_historical_join"); } finally { await lease.release(); }
  }));
  it("adds only0027 to fully migrated existing project without changing legacy rows/version/files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gateway-ledger-existing-")), pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    try {
      const resource = await AutomationStudioProjectFlowResourceRepository.open({ pool, projectId: "project.1" });
      await resource.upsertFlow({ flowId: "legacy.flow", parentFlowId: null, owningSubflowId: null, name: "Synthetic existing", description: "Unchanged", scopeKind: "domain", scopeId: "domain.test", visibility: "private", origin: "user", sourceMode: "visual", status: "draft", compiledRevision: null }); await resource.close();
      const candidate = await AutomationStudioCandidateVerificationStore.open({ pool, projectId: "project.1" }); await candidate.close();
      const staged = await AutomationStudioProjectAcceptedStateStore.open({ pool, projectId: "project.1" }); await staged.close();
      const legacy = path.join(root, "legacy.json"); await writeFile(legacy, '{"synthetic":"unchanged"}', "utf8"); const bytes = await readFile(legacy), lease = await pool.acquire("project.1");
      try {
        await lease.database.run("pragma user_version=42"); const before = await lease.database.all("select migration_id,checksum from automation_schema_migrations order by migration_id"), flows = await lease.database.all("select * from flows");
        const store = await Store.open({ pool, projectId: "project.1" });
        try {
          await store.claim(claim()); const after = await lease.database.all<{ migration_id: string }>("select migration_id,checksum from automation_schema_migrations order by migration_id");
          expect(after.filter(row => row.migration_id !== "0027_gateway_command_receipts_v1")).toEqual(before); expect(after).toHaveLength(before.length + 1); expect(await lease.database.get("pragma user_version")).toEqual({ user_version: 42 });
          expect(await lease.database.all("select * from flows")).toEqual(flows); expect(await readFile(legacy)).toEqual(bytes);
        } finally { await store.close(); }
      } finally { await lease.release(); }
    } finally { await pool.closeAll(); await removeOwned(root); }
  });
});
