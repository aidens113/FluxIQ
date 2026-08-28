import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectUnitOfWork, automationStudioMutationDigest } from "./project-unit-of-work.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-unit-of-work-test");

describe("AutomationStudioProjectUnitOfWork", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

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

