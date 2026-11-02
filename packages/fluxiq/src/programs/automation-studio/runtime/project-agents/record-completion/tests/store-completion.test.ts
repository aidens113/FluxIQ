// @fluxiq-test-group real-sql
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ProgramJsonStore } from "../../../../../_shared/storage.ts";
import { SQLiteRepository } from "../../../../../database-manager/index.ts";
import { AutomationStudioProjectDatabasePool } from "../../../../storage/project/index.ts";
import { AutomationStudioProjectExecutionAdmissionStore } from "../../../../storage/project/execution-admission/index.ts";
import { sqlAdmissionAuthority, sqlAdmissionFixture } from "../../../../storage/project/execution-admission/tests/fixture.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../../service/paths/index.ts";
import { AutomationStudioProjectBuildDocuments, AutomationStudioProjectBuildRecordStore } from "../../record/index.ts";
import { AutomationStudioSiteResetCallbackPolicies } from "../../../flow-bootstrap/reset-observation/index.ts";
import { queuedWriterFixture } from "./fixture.ts";

const ref = { projectId: "project.isolated", flowId: "flow.actual", buildId: "build.actual" };
const toggle = { from: "explored", node: "example.press", handles: ["control.1"], signature: { state: "selected" } } satisfies Parameters<AutomationStudioProjectBuildRecordStore["recordToggle"]>[1];

async function recordAt(root: string, layout: "memory" | "file" | "sqlite", now?: () => number) {
  await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: layout === "sqlite" ? 2 : 1 }));
  const projects = new AutomationStudioProjectPaths(layout === "memory" ? undefined : path.join(root, "programs", "automation-studio", "projects"));
  const flows = new AutomationStudioFlowPaths(projects);
  const records = new AutomationStudioProjectBuildRecordStore(projects, flows, now ? { now } : {});
  await records.create({ ...ref, instructionDigest: "e".repeat(64), sourceIds: ["instruction.1"] });
  return { projects, flows, records };
}

async function refusesReopen(sql: Parameters<Parameters<typeof sqlAdmissionFixture>[0]>[0], resource: string): Promise<void> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: sql.root });
  const reopened = await AutomationStudioProjectExecutionAdmissionStore.open({ pool, projectId: ref.projectId });
  try {
    const next = await sqlAdmissionAuthority(reopened, { series: true, resources: [resource], epoch: "epoch.after-reopen", runId: "run.after-reopen" });
    expect((await next.assembly.consumer.inspect(next.scope)).state).toBe("pending");
    await expect(next.assembly.consumer.reserve(next.scope, next.grant)).rejects.toThrow("execution_blocked");
  } finally {
    await reopened.close();
    await pool.closeAll();
  }
}

describe("actual project-record completion", () => {
  it.each(["memory", "file", "sqlite"] as const)("authenticates the real %s store's original write Promise", async layout => sqlAdmissionFixture(async sql => {
    const { projects, flows, records } = await recordAt(sql.root, layout);
    const resource = "owned.project-records:" + sql.root;
    const f = await queuedWriterFixture(sql.store, resource);
    const invocation = Object.freeze({});
    await expect(f.run({ receiver: records, callback: records.recordToggle, args: [ref, toggle, invocation] }, invocation)).resolves.toBeUndefined();
    expect(f.released()).toBe(true);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
    const reader = layout === "memory" ? records : new AutomationStudioProjectBuildRecordStore(projects, flows);
    expect((await reader.read(ref))?.record.toggles?.map(({ recordedAt: _at, ...value }) => value)).toEqual([toggle]);
  }));

  it("holds the root and real SQL document write until the original mutator and storage acknowledgement finish", async () => sqlAdmissionFixture(async sql => {
    const { projects, flows } = await recordAt(sql.root, "sqlite");
    const documents = new AutomationStudioProjectBuildDocuments(projects, flows);
    await documents.update(ref, "counter", () => ({ count: 0 }));
    const f = await queuedWriterFixture(sql.store, "owned.project-records:" + sql.root);
    let release!: () => void, started!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    const change = async (current: { [key: string]: unknown } | undefined) => {
      started();
      await held;
      return { count: Number(current?.count) + 1 };
    };
    // This original fixture callback only waits and computes data; the real Documents owns the IO.
    AutomationStudioSiteResetCallbackPolicies.rememberLexical(change, "pure");
    const invocation = Object.freeze({});
    const running = f.run({ receiver: documents, callback: documents.update, args: [ref, "counter", change, invocation] }, invocation);
    await entered;
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
    expect(f.released()).toBe(false);
    expect(await documents.read(ref, "counter")).toEqual({ count: 0 });
    release();
    await expect(running).resolves.toEqual({ count: 1 });
    expect(f.released()).toBe(true);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
    expect(await new AutomationStudioProjectBuildDocuments(projects, flows).read(ref, "counter")).toEqual({ count: 1 });
  }));

  it("fences the next native write after an unsupported clock and keeps that refusal across reopen", async () => sqlAdmissionFixture(async sql => {
    let calls = 0;
    const receivers: unknown[] = [];
    const { records } = await recordAt(sql.root, "sqlite", function (this: unknown) {
      receivers.push(this);
      calls++;
      return 1000 + calls;
    });
    calls = 0;
    receivers.splice(0);
    const resource = "owned.project-records:" + sql.root;
    const f = await queuedWriterFixture(sql.store, resource);
    const invocation = Object.freeze({});
    const puts = vi.spyOn(SQLiteRepository.prototype, "put");
    try {
      await expect(f.run({ receiver: records, callback: records.recordToggle, args: [ref, toggle, invocation] }, invocation)).rejects.toThrow("reservation_not_active");
      expect(puts).not.toHaveBeenCalled();
    } finally { puts.mockRestore(); }
    expect(calls).toBe(1);
    expect(receivers).toEqual([records]);
    expect((await records.read(ref))?.record.toggles).toBeUndefined();
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
    await refusesReopen(sql, resource);
    expect(calls).toBe(1);
  }));

  it("retains a real write followed by a lost acknowledgement and refuses second IO after reopen", async () => sqlAdmissionFixture(async sql => {
    const { records } = await recordAt(sql.root, "sqlite");
    const resource = "owned.project-records:" + sql.root;
    const f = await queuedWriterFixture(sql.store, resource);
    const originalUpdate = ProgramJsonStore.prototype.update;
    const error = new Error("actual record acknowledgement lost");
    let writes = 0;
    const replaced = vi.spyOn(ProgramJsonStore.prototype, "update").mockImplementation(async function (this: ProgramJsonStore, mutator) {
      await originalUpdate.call(this, mutator);
      writes++;
      throw error;
    });
    try {
      const invocation = Object.freeze({});
      await expect(f.run({ receiver: records, callback: records.recordToggle, args: [ref, toggle, invocation] }, invocation)).rejects.toBe(error);
    } finally { replaced.mockRestore(); }
    expect(writes).toBe(1);
    expect((await records.read(ref))?.record.toggles).toHaveLength(1);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
    await refusesReopen(sql, resource);
    expect(writes).toBe(1);
  }));
});
