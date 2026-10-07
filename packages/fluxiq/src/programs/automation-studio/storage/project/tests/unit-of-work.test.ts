import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../database.ts";
import { AutomationStudioProjectUnitOfWork, automationStudioMutationDigest } from "../unit-of-work.ts";

// Its own directory per case: a fixed path under the working directory was
// shared by every run of this file in the checkout, so two runs at once
// deleted and overwrote each other's data.
let rootDir = "";

describe("AutomationStudioProjectUnitOfWork", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-unit-of-work-test-"));
  });
  afterEach(async () => {
    const owned = path.resolve(rootDir);
    if (path.dirname(owned) !== path.resolve(os.tmpdir()) || !path.basename(owned).startsWith("automation-studio-unit-of-work-test-")) throw new Error("Refusing nonowned fixture cleanup");
    await rm(owned, { recursive: true, force: true });
  });

  it("runs trusted admission inside the mutation transaction before initial work and every replay", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir }), unit = await AutomationStudioProjectUnitOfWork.open({ pool, projectId: "project.admission" });
    let checks = 0, effects = 0;
    const input = { mutationId: "mutation.admission", operationKind: "noop", ownerKind: "project", ownerId: "project.admission", request: { value: 1 }, validateAdmission: async (sql: import("../database.ts").AutomationStudioSqlExecutor) => { checks++; expect(await sql.get("select mutation_id from mutation_records where mutation_id='mutation.admission'")).toEqual(checks === 1 ? undefined : { mutation_id: "mutation.admission" }); if (checks === 3) throw new Error("admission.closed"); } };
    try {
      expect((await unit.runIdempotent(input, async () => { effects++; return { ok: true }; })).replayed).toBe(false);
      expect((await unit.runIdempotent(input, async () => { effects++; return { ok: false }; })).replayed).toBe(true);
      await expect(unit.runIdempotent(input, async () => { effects++; return { ok: false }; })).rejects.toThrow("admission.closed");
      expect(checks).toBe(3); expect(effects).toBe(1); expect((await unit.getMutation(input.mutationId))?.status).toBe("committed");
    } finally { await unit.close(); await pool.closeAll(); }
  });

  it("rolls back admission SQL and records failure without calling the mutation", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir }), unit = await AutomationStudioProjectUnitOfWork.open({ pool, projectId: "project.admission.failure" });
    let effects = 0;
    try {
      await expect(unit.runIdempotent({ mutationId: "mutation.admission.failure", operationKind: "noop", ownerKind: "project", ownerId: "project.admission.failure", validateAdmission: async sql => { await sql.run("insert into flows(flow_id,name,scope_kind,visibility,origin,source_mode,status,created_at_ms,updated_at_ms) values('flow.admission','X','project','project','user','visual','draft',1,1)"); throw new Error("admission.failed"); } }, async () => { effects++; return null; })).rejects.toThrow("admission.failed");
      expect(effects).toBe(0); expect((await unit.getMutation("mutation.admission.failure"))?.status).toBe("failed");
      const lease = await pool.acquire("project.admission.failure"); try { expect(await lease.database.get("select flow_id from flows where flow_id='flow.admission'")).toBeUndefined(); } finally { await lease.release(); }
    } finally { await unit.close(); await pool.closeAll(); }
  });

  it("commits SQL work, touched entities, and change-feed rows as one idempotent mutation", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const unit = await AutomationStudioProjectUnitOfWork.open({ pool, projectId: "project.uow" });
    let executions = 0;
    const request = { flowId: "flow.1", name: "One" };
    const first = await unit.runIdempotent({ mutationId: "mutation.1", operationKind: "flow.create", ownerKind: "flow", ownerId: "flow.1", request, changedAt: 1 }, async (context) => {
      executions += 1;
      await context.sql.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow.1', 'One', 'project', 'project', 'user', 'visual', 'draft', 1, 1)");
      const sequence = await context.recordChange({ entityKind: "flow", entityId: "flow.1", operation: "create", revision: 1 });
      return { ok: true, sequence };
    });
    const second = await unit.runIdempotent({ mutationId: "mutation.1", operationKind: "flow.create", ownerKind: "flow", ownerId: "flow.1", request, changedAt: 999 }, async () => {
      executions += 1;
      return { ok: false };
    });
    expect(first).toMatchObject({ replayed: false, firstChangeSequence: 1, lastChangeSequence: 1, response: { ok: true, sequence: 1 } });
    expect(second).toMatchObject({ replayed: true, firstChangeSequence: 1, lastChangeSequence: 1, response: { ok: true, sequence: 1 } });
    expect(executions).toBe(1);
    await expect(unit.getMutation("mutation.1")).resolves.toMatchObject({ status: "committed", requestDigest: automationStudioMutationDigest(request) });
    await expect(unit.listTouchedEntities("mutation.1")).resolves.toMatchObject([{ entityKind: "flow", entityId: "flow.1", operation: "create", revision: 1 }]);
    await unit.close();
    await pool.closeAll();
  });

  it("rejects a reused mutation id with a different request digest", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const unit = await AutomationStudioProjectUnitOfWork.open({ pool, projectId: "project.digest" });
    await unit.runIdempotent({ mutationId: "mutation.same", operationKind: "noop", ownerKind: "project", ownerId: "project.digest", request: { value: 1 }, changedAt: 1 }, async () => ({ value: 1 }));
    await expect(unit.runIdempotent({ mutationId: "mutation.same", operationKind: "noop", ownerKind: "project", ownerId: "project.digest", request: { value: 2 }, changedAt: 2 }, async () => ({ value: 2 }))).rejects.toThrow(/different request digest/);
    await unit.close();
    await pool.closeAll();
  });

  it("rolls back failed work and persists a bounded failure record", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const unit = await AutomationStudioProjectUnitOfWork.open({ pool, projectId: "project.failure" });
    await expect(unit.runIdempotent({ mutationId: "mutation.fail", operationKind: "flow.create", ownerKind: "flow", ownerId: "flow.fail", request: { flowId: "flow.fail" }, changedAt: 1 }, async (context) => {
      await context.sql.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow.fail', 'Fail', 'project', 'project', 'user', 'visual', 'draft', 1, 1)");
      throw new Error("boom");
    })).rejects.toThrow(/boom/);
    await expect(unit.getMutation("mutation.fail")).resolves.toMatchObject({ status: "failed" });
    const lease = await pool.acquire("project.failure");
    await expect(lease.database.get<{ count: number }>("select count(*) as count from flows where flow_id = 'flow.fail'")).resolves.toEqual({ count: 0 });
    await lease.release();
    await unit.close();
    await pool.closeAll();
  });
});

