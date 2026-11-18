// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ClientGatewayCommandLedgerController as Controller, type ClientGatewayCommandClaim } from "../../../../../../client-gateway/service/command-ledger/index.ts";
import { ClientGatewayCommandUnsentRefusal as Unsent } from "../../../../../../client-gateway/service/command-ledger/index.ts";
import { AutomationStudioProjectCommandLedgerStore as Store } from "../store.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";

function claim(attemptId = "attempt.1"): ClientGatewayCommandClaim {
  const owner = { projectId: "project.1", runId: "run.1", flowId: "flow.1", invocationId: "invoke.1", attemptId, effectOrdinal: 0 };
  return { binding: { schemaVersion: "gateway_command.v1", ...owner, commandId: Controller.commandId(owner), clientId: "client.1", sessionId: "session.1" }, requestDigest: Controller.digest({ synthetic: "act" }) };
}

async function fixture(work: (store: Store, pool: AutomationStudioProjectDatabasePool, root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "gateway-unsent-"));
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const store = await Store.open({ pool, projectId: "project.1" });
  try { await work(store, pool, root); }
  finally {
    vi.restoreAllMocks();
    await store.close();
    await pool.closeAll();
    const owned = path.resolve(root);
    if (path.dirname(owned) !== path.resolve(os.tmpdir()) || !path.basename(owned).startsWith("gateway-unsent-")) throw new Error("nonowned cleanup");
    await rm(owned, { recursive: true, force: true });
  }
}

describe("real SQL known-unsent terminal command history", () => {
  it("retains the original claim, never creates a receipt/unknown, and reopens without resending", async () => fixture(async (store, _pool, root) => {
    const input = claim(), proof = Unsent.create(input, "host_lease.stale");
    expect((await store.claim(input)).sendAllowed).toBe(true);
    const record = await store.refuseUnsent(input, proof);
    expect(record).toMatchObject({ state: "refused_unsent", claim: input, receipt: null, committedAt: null, unknownReason: null });
    expect(await store.refuseUnsent(input, proof)).toEqual(record);
    const reopenedPool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    const reopened = await Store.open({ pool: reopenedPool, projectId: "project.1" });
    try {
      const send = vi.fn();
      expect(await new Controller(reopened).dispatch(input, send)).toEqual({ status: "refused_unsent", refusal: record.refusal });
      expect(send).not.toHaveBeenCalled();
      expect(await reopened.claim(input)).toMatchObject({ sendAllowed: false, record });
      const sql = await reopenedPool.acquire("project.1");
      try {
        expect(await sql.database.get("select count(*) as n from gateway_command_claims")).toEqual({ n: 1 });
        expect(await sql.database.get("select count(*) as n from gateway_command_receipts")).toEqual({ n: 0 });
        expect(await sql.database.get("select count(*) as n from gateway_command_unknowns")).toEqual({ n: 0 });
      } finally { await sql.release(); }
    } finally { await reopened.close();
      await reopenedPool.closeAll(); }
  }));

  it("admits a fresh attempt past verified unsent history without fake receipt consumption", async () => fixture(async store => {
    const admission = await store.openRunAdmission("run.1");
    const first = claim(), second = claim("attempt.2");
    expect((await store.claimForRun(first, admission)).sendAllowed).toBe(true);
    await store.refuseUnsent(first, Unsent.create(first, "host_lease.stale"));
    expect((await store.claimForRun(second, admission)).sendAllowed).toBe(true);
    expect((await store.readRun("run.1")).records.map((record) => record.state).sort()).toEqual(["pending", "refused_unsent"]);
  }));

  it("rejects copied/foreign proof and never derives unsent certainty from an old pending claim", async () => fixture(async (store, _pool, root) => {
    const input = claim();
    await store.claim(input);
    const foreign = Unsent.create(claim("other.attempt"), "host_lease.stale");
    expect(() => store.refuseUnsent(input, foreign)).toThrow("foreign_unsent_proof");
    expect(() => store.refuseUnsent(input, Object.create(Unsent.prototype))).toThrow("foreign_unsent_proof");
    const reopenedPool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    const reopened = await Store.open({ pool: reopenedPool, projectId: "project.1" });
    try {
      expect((await reopened.read(input))?.state).toBe("pending");
      const send = vi.fn();
      expect(await new Controller(reopened).dispatch(input, send)).toEqual({ status: "outcome_unknown" });
      expect(send).not.toHaveBeenCalled();
    } finally { await reopened.close();
      await reopenedPool.closeAll(); }
  }));

  it("failed settlement retains unresolved pending history and does not write false send uncertainty", async () => fixture(async (store, pool) => {
    const sql = await pool.acquire("project.1"), input = claim(), proof = Unsent.create(input, "host_lease.stale");
    try {
      await sql.database.run("create trigger reject_unsent before insert on gateway_command_unsent_refusals begin select raise(abort,'synthetic refusal write failure'); end");
      await expect(new Controller(store).dispatch(input, async () => { throw proof; })).rejects.toBe(proof);
      expect((await store.read(input))?.state).toBe("pending");
      expect(await sql.database.get("select count(*) as n from gateway_command_unknowns")).toEqual({ n: 0 });
      expect(await sql.database.get("select count(*) as n from gateway_command_receipts")).toEqual({ n: 0 });
      expect(await sql.database.get("select count(*) as n from gateway_command_unsent_refusals")).toEqual({ n: 0 });
    } finally { await sql.release(); }
  }));

  it("detects refusal corruption, historical deletion, and conflicting terminal writes", async () => fixture(async (store, pool) => {
    const input = claim(), proof = Unsent.create(input, "host_lease.stale");
    await store.claim(input);
    await store.refuseUnsent(input, proof);
    await expect(store.markUnknown(input, "timeout")).rejects.toThrow("unsent_terminal");
    await expect(store.refuseUnsent(input, Unsent.create(input, "host_lease.missing"))).rejects.toThrow("unsent_conflict");
    const sql = await pool.acquire("project.1");
    try {
      await sql.database.run("update gateway_command_unsent_refusals set code='host_lease.missing'");
      await expect(store.read(input)).rejects.toThrow("corrupt_unsent_refusal");
      await sql.database.run("delete from gateway_command_unsent_refusals");
      await expect(store.read(input)).rejects.toThrow("missing_historical_join");
    } finally { await sql.release(); }
  }));
});
