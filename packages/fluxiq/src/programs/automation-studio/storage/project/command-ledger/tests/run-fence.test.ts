import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ClientGatewayCommandLedgerController as Rules, type ClientGatewayCommandClaim } from "../../../../../../client-gateway/service/command-ledger/index.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AutomationStudioProjectCommandLedgerStore as Store, AutomationStudioCommandRunAdmission, AUTOMATION_STUDIO_COMMAND_SCAN_LIMIT } from "../index.ts";

function claim(invocationId: string): ClientGatewayCommandClaim {
  const owner = { projectId: "project.1", runId: "run.1", flowId: "flow.1", invocationId, attemptId: "node.attempt.1", effectOrdinal: 0 };
  return { binding: { schemaVersion: "gateway_command.v1", ...owner, commandId: Rules.commandId(owner), clientId: "client.1", sessionId: "session.1" }, requestDigest: Rules.digest({ items: ["synthetic"] }) };
}
async function fixture(operation: (first: Store, second: Store, pool: AutomationStudioProjectDatabasePool) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "gateway-run-fence-")), pool = new AutomationStudioProjectDatabasePool({ rootDir: root }), otherPool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const first = await Store.open({ pool, projectId: "project.1" }), second = await Store.open({ pool: otherPool, projectId: "project.1" });
  try { await operation(first, second, pool); } finally { await first.close(); await second.close(); await pool.closeAll(); await otherPool.closeAll(); const owned = path.resolve(root); if (path.dirname(owned) !== path.resolve(os.tmpdir()) || !path.basename(owned).startsWith("gateway-run-fence-")) throw new Error("Refusing nonowned fixture cleanup"); await rm(owned, { recursive: true, force: true }); }
}
describe("closed actual project SQL run admission", () => {
  it("allows exactly one competing owner to claim and send a different command in the same run", async () => fixture(async (first, second) => {
    const admissions = await Promise.all([first.openRunAdmission("run.1"), second.openRunAdmission("run.1")]);
    const sends: string[] = [];
    const dispatch = async (store: Store, invocationId: string, admission: AutomationStudioCommandRunAdmission) => { const input = claim(invocationId), claimed = await store.claimForRun(input, admission); if (claimed.sendAllowed) { expect((await store.read(input))?.state).toBe("pending"); sends.push(invocationId); } };
    const results = await Promise.allSettled([dispatch(first, "invoke.1", admissions[0]!), dispatch(second, "invoke.2", admissions[1]!)]);
    expect(sends).toHaveLength(1); expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  }));

  it("refuses copied/foreign capabilities, conflicting exact first payload/session and a second command after success", async () => fixture(async (first, second) => {
    const admission = await first.openRunAdmission("run.1"), input = claim("invoke.1");
    for (const forged of [JSON.parse(JSON.stringify(admission)), AutomationStudioCommandRunAdmission.create()]) expect(() => first.claimForRun(input, forged)).toThrow("foreign_admission");
    expect(() => second.claimForRun(input, admission)).toThrow("foreign_admission");
    expect((await first.claimForRun(input, admission)).sendAllowed).toBe(true);
    expect(() => first.claimForRun({ ...input, requestDigest: Rules.digest({ items: ["changed"] }) }, admission)).toThrow("first_command_only");
    expect(() => first.claimForRun({ ...input, binding: { ...input.binding, sessionId: "session.2" } }, admission)).toThrow("first_command_only");
    await first.commitReceipt(input, receipt(input));
    expect(() => first.claimForRun(claim("invoke.2"), admission)).toThrow("first_command_only");
    const replay = await first.claimForRun(input, admission); expect(replay.sendAllowed).toBe(false); expect(replay.record.state).toBe("committed");
    await expect(second.openRunAdmission("run.1")).rejects.toThrow("prior_run_claim");
  }));

  it.each(["pending", "unknown", "committed"])("refuses fresh/reconstructed %s run while exposing deeply frozen informational observations", async status => fixture(async (first, second) => {
    const input = claim("invoke.1"), admission = await first.openRunAdmission("run.1"); await first.claimForRun(input, admission);
    if (status === "unknown") await first.markUnknown(input, "send_uncertain");
    if (status === "committed") { await first.markUnknown(input, "send_uncertain"); await first.commitReceipt(input, receipt(input)); }
    const observed = await second.readRun("run.1"); expect(observed.records[0]?.state).toBe(status); expect(Object.isFrozen(observed)).toBe(true); expect(Object.isFrozen(observed.records[0]?.claim.binding)).toBe(true);
    expect(observed.historicalUnknownCommandIds).toEqual(status === "pending" ? [] : [input.binding.commandId]);
    await expect(second.openRunAdmission("run.1")).rejects.toThrow("prior_run_claim");
    await second.openRunAdmission("other.run");
  }));

  it("validates complete original durable joins even on exact first replay", async () => fixture(async (first, _second, pool) => {
    const input = claim("invoke.1"), admission = await first.openRunAdmission("run.1"); await first.claimForRun(input, admission);
    const lease = await pool.acquire("project.1"); try { await lease.database.run("update mutation_records set owner_id='foreign.owner' where mutation_id=?", [`${input.binding.commandId}.claim`]); } finally { await lease.release(); }
    await expect(first.claimForRun(input, admission)).rejects.toThrow("corrupt_mutation_join");
  }));

  it.each(["receipt", "unknown", "mutation"])("refuses orphan %s inventory with no claims", async orphan => fixture(async (first, _second, pool) => {
    const lease = await pool.acquire("project.1"); try {
      await lease.database.run("pragma foreign_keys=off");
      if (orphan === "receipt") await lease.database.run("insert into gateway_command_receipts values('orphan','{}','bad',1)");
      if (orphan === "unknown") await lease.database.run("insert into gateway_command_unknowns values('orphan','send_uncertain','bad')");
      if (orphan === "mutation") { const input = claim("invoke.1"); await lease.database.run("insert into mutation_records(mutation_id,operation_kind,owner_kind,owner_id,request_digest,status,response_json,created_at_ms,updated_at_ms) values(?,'gateway_command.claim','gateway_command',?,?,'committed','{}',1,1)", [`${input.binding.commandId}.claim`, input.binding.commandId, input.requestDigest]); }
    } finally { await lease.release(); }
    await expect(first.openRunAdmission("run.1")).rejects.toThrow(/orphan/);
  }));

  it("refuses malformed/foreign project history before selecting a different clean run", async () => fixture(async (first, _second, pool) => {
    const input = claim("invoke.1"); await first.claim(input);
    const lease = await pool.acquire("project.1"); try { const foreign = { ...input, binding: { ...input.binding, projectId: "project.foreign" } }; await lease.database.run("update gateway_command_claims set claim_json=?", [JSON.stringify(foreign)]); } finally { await lease.release(); }
    await expect(first.openRunAdmission("other.run")).rejects.toThrow();
  }));

  it("refuses overflow after deterministic bounded full pages without granting admission", async () => fixture(async (first, _second, pool) => {
    const lease = await pool.acquire("project.1");
    try { await lease.database.run("with recursive numbers(i) as (select 0 union all select i+1 from numbers where i<?) insert into gateway_command_claims(command_id,claim_json,proof_digest,claimed_at_ms) select printf('synthetic.%08d',i),'{}','bad',1 from numbers", [AUTOMATION_STUDIO_COMMAND_SCAN_LIMIT]); } finally { await lease.release(); }
    await expect(first.readRun("run.1")).rejects.toThrow("scan_limit");
  }));

  it("immediately invalidates admission on close and waits an owned in-flight claim before releasing storage", async () => fixture(async (first, _second, pool) => {
    const input = claim("invoke.1"), admission = await first.openRunAdmission("run.1"), lease = await pool.acquire("project.1");
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
    const original = lease.database.transaction.bind(lease.database), spy = vi.spyOn(lease.database, "transaction").mockImplementation(async operation => { entered(); await held; return original(operation); });
    const pending = first.claimForRun(input, admission); await started; let closed = false; const closing = first.close().then(() => { closed = true; });
    expect(() => first.claimForRun(input, admission)).toThrow("closed"); await Promise.resolve(); expect(closed).toBe(false); release();
    try { expect((await pending).sendAllowed).toBe(true); await closing; } finally { spy.mockRestore(); await lease.release(); }
  }));
});

function receipt(input: ClientGatewayCommandClaim) { return { schemaVersion: "gateway_command_receipt.v1" as const, commandId: input.binding.commandId, requestDigest: input.requestDigest, clientId: input.binding.clientId, sessionId: input.binding.sessionId, status: "succeeded" as const, receivedAt: Date.now(), resultDigest: Rules.digest({ result: "synthetic" }), redaction: "receipt_only" as const }; }
