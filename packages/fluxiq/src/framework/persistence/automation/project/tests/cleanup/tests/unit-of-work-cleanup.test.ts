// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioSchemaMigrationRunner } from "../../../../schema-migrations.ts";
import { AutomationStudioProjectDatabasePool } from "../../../database.ts";
import { AutomationStudioStatementCache } from "../../../statement-cache.ts";
import { AutomationStudioProjectUnitOfWork } from "../../../unit-of-work.ts";

let rootDir = "";
const pools: AutomationStudioProjectDatabasePool[] = [];

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-unit-cleanup-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(pools.splice(0).map(pool => pool.closeAll()));
  await rm(rootDir, { recursive: true, force: true });
});

function createPool(): AutomationStudioProjectDatabasePool {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir });
  pools.push(pool);
  return pool;
}

function expectCombined(outcome: unknown, primary: unknown, cleanup: unknown): AggregateError {
  expect(outcome).toBeInstanceOf(AggregateError);
  if (!(outcome instanceof AggregateError)) throw new Error("Expected both original failures.");
  expect(outcome.errors[0]).toBe(primary);
  expect(outcome.errors[1]).toBe(cleanup);
  expect(outcome.cause).toBe(primary);
  return outcome;
}

describe("project unit-of-work cleanup failure ownership", () => {
  it.each([false, true])("retains the actual migration failure when release fails=%s", async releaseFails => {
    const pool = createPool();
    const initial = await pool.acquire("project.migration");
    await initial.database.run("create table flows (invalid_column text)");
    await initial.release();

    let primary: unknown;
    const migrate = AutomationStudioSchemaMigrationRunner.prototype.migrate;
    vi.spyOn(AutomationStudioSchemaMigrationRunner.prototype, "migrate").mockImplementation(async function(this: AutomationStudioSchemaMigrationRunner) {
      try {
        return await Reflect.apply(migrate, this, []);
      } catch (error) {
        primary = error;
        throw error;
      }
    });

    const cleanup = new Error("lease release acknowledgement failed");
    let releaseCalls = 0;
    const acquire = pool.acquire.bind(pool);
    vi.spyOn(pool, "acquire").mockImplementation(async projectId => {
      const lease = await acquire(projectId);
      const release = lease.release;
      lease.release = async () => {
        releaseCalls += 1;
        await release();
        if (releaseFails) throw cleanup;
      };
      return lease;
    });

    const outcome = await AutomationStudioProjectUnitOfWork.open({ pool, projectId: "project.migration" }).then(() => undefined, error => error);
    expect(primary).toBeInstanceOf(Error);
    expect(primary).toMatchObject({ code: "SQLITE_ERROR" });
    expect(releaseCalls).toBe(1);
    expect(pool.stats().openProjects).toBe(0);
    if (releaseFails) expectCombined(outcome, primary, cleanup);
    else expect(outcome).toBe(primary);
  });

  it.each([false, true])("retains the transaction error when its failure record fails=%s", async persistenceFails => {
    const pool = createPool();
    const unit = await AutomationStudioProjectUnitOfWork.open({ pool, projectId: "project.failure" });
    const lease = await pool.acquire("project.failure");
    const primary = new Error("mutation callback failed");
    let cleanup: unknown;
    if (persistenceFails) {
      await lease.database.run("create trigger reject_failure before insert on mutation_records when new.status = 'failed' begin select raise(abort, 'failure ledger unavailable'); end");
    }
    const run = lease.database.run.bind(lease.database);
    vi.spyOn(lease.database, "run").mockImplementation(async (sql, params) => {
      try {
        return await run(sql, params);
      } catch (error) {
        cleanup = error;
        throw error;
      }
    });

    try {
      const outcome = await unit.runIdempotent({ mutationId: "mutation.failure", operationKind: "flow.create", ownerKind: "flow", ownerId: "flow.failure" }, async context => {
        await context.sql.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow.failure', 'Failed', 'project', 'project', 'user', 'visual', 'draft', 1, 1)");
        throw primary;
      }).then(() => undefined, error => error);
      await expect(lease.database.get("select flow_id from flows where flow_id = 'flow.failure'")).resolves.toBeUndefined();
      if (persistenceFails) {
        expect(cleanup).toMatchObject({ code: "SQLITE_CONSTRAINT", message: expect.stringContaining("failure ledger unavailable") });
        expectCombined(outcome, primary, cleanup);
        await expect(unit.getMutation("mutation.failure")).resolves.toBeNull();
      } else {
        expect(outcome).toBe(primary);
        await expect(unit.getMutation("mutation.failure")).resolves.toMatchObject({ status: "failed" });
      }
    } finally {
      await unit.close();
      await lease.release();
    }
  });

  it("retains an existing transaction AggregateError when the failure record also fails", async () => {
    const pool = createPool();
    const unit = await AutomationStudioProjectUnitOfWork.open({ pool, projectId: "project.nested" });
    const lease = await pool.acquire("project.nested");
    const primary = new Error("mutation callback failed");
    const rollback = new Error("rollback acknowledgement failed");
    let persistence: unknown;
    await lease.database.run("create trigger reject_failure before insert on mutation_records when new.status = 'failed' begin select raise(abort, 'failure ledger unavailable'); end");
    const run = lease.database.run.bind(lease.database);
    vi.spyOn(lease.database, "run").mockImplementation(async (sql, params) => {
      try {
        return await run(sql, params);
      } catch (error) {
        persistence = error;
        throw error;
      }
    });
    const runStatement = AutomationStudioStatementCache.prototype.run;
    vi.spyOn(AutomationStudioStatementCache.prototype, "run").mockImplementation(async function(this: AutomationStudioStatementCache, sql, params) {
      const result = await Reflect.apply(runStatement, this, [sql, params]);
      if (sql === "rollback") throw rollback;
      return result;
    });
    try {
      const outcome = await unit.runIdempotent({ mutationId: "mutation.nested", operationKind: "noop", ownerKind: "project", ownerId: "project.nested" }, async context => {
        await context.sql.run("select 1");
        throw primary;
      }).then(() => undefined, error => error);
      expect(outcome).toBeInstanceOf(AggregateError);
      if (!(outcome instanceof AggregateError)) throw new Error("Expected transaction and persistence failures.");
      const transactionFailure = expectCombined(outcome.errors[0], primary, rollback);
      expect(persistence).toMatchObject({ code: "SQLITE_CONSTRAINT" });
      expectCombined(outcome, transactionFailure, persistence);
    } finally {
      await unit.close();
      await lease.release();
    }
  });
});
