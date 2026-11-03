// @fluxiq-test-group real-sql
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { SQLiteRepository } from "../../../../../framework/persistence/sqlite/index.ts";
import { ExecutionObservationSource, prepareObservedExecutionCallback, type OwnedExecutionCallback } from "../../../../../runtime/execution-observation/index.ts";
import type { ModelExecutionOptions } from "../../../../../runtime/models/execution/index.ts";
import { AutomationStudioProjectDatabasePool } from "../../../storage/project/index.ts";
import { AutomationStudioProjectExecutionAdmissionStore } from "../../../../../framework/persistence/project/execution-admission/index.ts";
import { sqlAdmissionAuthority, sqlAdmissionFixture } from "../../../storage/project/execution-admission/tests/fixture.ts";
import { automationStudioLlmCurrentFlowPurse } from "../../llm/build-purse/index.ts";
import { AutomationStudioFlowBootstrapCreationSpendStore } from "../creation-spend.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../paths/index.ts";
import { AutomationStudioProjectStore } from "../projects/index.ts";

const projectId = "project.isolated";
const flowId = "flow.actual";
type SqlFixture = Parameters<Parameters<typeof sqlAdmissionFixture>[0]>[0];

async function spendAt(root: string, layout: "memory" | "file" | "sqlite") {
  await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: layout === "sqlite" ? 2 : 1 }));
  const projects = new AutomationStudioProjectPaths(layout === "memory" ? undefined : path.join(root, "programs", "automation-studio", "projects"));
  const flows = new AutomationStudioFlowPaths(projects);
  const owner = new AutomationStudioProjectStore(projects);
  return { store: new AutomationStudioFlowBootstrapCreationSpendStore(projects, flows, owner), projects, flows, owner };
}

async function observedSpend(sql: SqlFixture, resource: string) {
  let callbacks!: ExecutionObservationSource;
  const actual = await sqlAdmissionAuthority(sql.store, { series: true, resources: [resource], configure(assembly, scope, source) {
    callbacks = new ExecutionObservationSource(scope, "fixture.actual-spend");
    source.delegatesTo.push(callbacks.owner);
    callbacks.connect(assembly.registerSource(callbacks.registration([callbacks.owner])));
  } });
  const reserved = await actual.assembly.consumer.reserve(actual.scope, actual.grant);
  const observation = callbacks.forParent({ reservation: reserved.reservation, parent: reserved.root });
  const prepare = async (spend: AutomationStudioFlowBootstrapCreationSpendStore, cost: number): Promise<OwnedExecutionCallback<{ run(): Promise<void> }, [], Promise<void>>> => {
    const execution: ModelExecutionOptions = {};
    const core = { run(): Promise<void> {
      return spend.withFlowPurse(projectId, flowId, 0.1, async () => {
        const purse = automationStudioLlmCurrentFlowPurse();
        if (!purse) throw new Error("The real Flow purse must be current.");
        const held = purse.hold({ projectedCostUsd: 0.01, estimatedInputTokens: 100, maxOutputTokens: 20 }, execution);
        if (!held.ok || !held.hold.settleObserved) throw new Error("The actual held call must support settlement.");
        await held.hold.settleObserved({ estimatedCostUsd: cost, inputTokens: 100 }, execution);
      });
    } };
    callbacks.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => callbacks.frameCompletion(invocation) });
    const owned = await prepareObservedExecutionCallback(observation, { receiver: core, callback: core.run, args: [] });
    if (owned.observation) Object.defineProperty(execution, "observation", { value: owned.observation, enumerable: true });
    Object.freeze(execution);
    return owned;
  };
  return { ...actual, callbacks, reserved, prepare };
}

async function refusesReopen(sql: SqlFixture, resource: string): Promise<void> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: sql.root });
  const reopened = await AutomationStudioProjectExecutionAdmissionStore.open({ pool, projectId });
  try {
    const next = await sqlAdmissionAuthority(reopened, { series: true, resources: [resource], epoch: "epoch.after-spend-reopen", runId: "run.after-spend-reopen" });
    expect((await next.assembly.consumer.inspect(next.scope)).state).toBe("pending");
    await expect(next.assembly.consumer.reserve(next.scope, next.grant)).rejects.toThrow("execution_blocked");
  } finally {
    await reopened.close();
    await pool.closeAll();
  }
}

it.each(["memory", "file", "sqlite"] as const)("acknowledges the actual %s spend owner and charges one call once", async layout => sqlAdmissionFixture(async sql => {
  const { store, projects, flows, owner } = await spendAt(sql.root, layout);
  const f = await observedSpend(sql, "owned.flow-spend:" + sql.root);
  const owned = await f.prepare(store, 0.007);
  await owned.invoke();
  expect(owned.completion()).toBe("settled");
  await f.callbacks.flush();
  await f.ports.producer.finish(f.reserved.root, f.source.complete(f.origin));
  await f.assembly.consumer.release(f.reserved.reservation);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
  const reader = layout === "memory" ? store : new AutomationStudioFlowBootstrapCreationSpendStore(projects, flows, owner);
  expect(await reader.get(projectId, flowId)).toMatchObject({ spentUsd: 0.007, calls: 1 });
}));

it("keeps the actual observed call pending until the native SQL spend commit acknowledges", async () => sqlAdmissionFixture(async sql => {
  const { store, projects, flows, owner } = await spendAt(sql.root, "sqlite");
  const f = await observedSpend(sql, "owned.flow-spend:" + sql.root);
  const owned = await f.prepare(store, 0.007);
  const originalPut = SQLiteRepository.prototype.put;
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const called = new Promise<void>(resolve => { entered = resolve; });
  let writes = 0;
  const replaced = vi.spyOn(SQLiteRepository.prototype, "put").mockImplementation(async function (this: SQLiteRepository, record) {
    if (record.id.endsWith("/creation-spend")) {
      writes++;
      entered();
      await held;
    }
    return await originalPut.call(this, record);
  });
  try {
    const running = owned.invoke();
    await called;
    expect(owned.completion()).toBe("pending");
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
    expect(await new AutomationStudioFlowBootstrapCreationSpendStore(projects, flows, owner).get(projectId, flowId)).toBeUndefined();
    expect(writes).toBe(1);
    release();
    await running;
    expect(owned.completion()).toBe("settled");
    expect(await new AutomationStudioFlowBootstrapCreationSpendStore(projects, flows, owner).get(projectId, flowId)).toMatchObject({ spentUsd: 0.007, calls: 1 });
  } finally {
    release();
    replaced.mockRestore();
    await f.assembly.consumer.release(f.reserved.reservation);
  }
}));

it("awaits each interleaved call's own queued prefix rather than the other call's acknowledgment", async () => sqlAdmissionFixture(async sql => {
  const { store } = await spendAt(sql.root, "sqlite");
  const originalPut = SQLiteRepository.prototype.put;
  let firstRelease!: () => void;
  let secondRelease!: () => void;
  let firstEntered!: () => void;
  let secondEntered!: () => void;
  const firstHeld = new Promise<void>(resolve => { firstRelease = resolve; });
  const secondHeld = new Promise<void>(resolve => { secondRelease = resolve; });
  const firstCalled = new Promise<void>(resolve => { firstEntered = resolve; });
  const secondCalled = new Promise<void>(resolve => { secondEntered = resolve; });
  let writes = 0;
  const replaced = vi.spyOn(SQLiteRepository.prototype, "put").mockImplementation(async function (this: SQLiteRepository, record) {
    if (record.id.endsWith("/creation-spend")) {
      writes++;
      if (writes === 1) {
        firstEntered();
        await firstHeld;
      } else if (writes === 2) {
        secondEntered();
        await secondHeld;
      }
    }
    return await originalPut.call(this, record);
  });
  try {
    await store.withFlowPurse(projectId, flowId, 0.1, async () => {
      const purse = automationStudioLlmCurrentFlowPurse();
      if (!purse) throw new Error("The actual Flow purse is required.");
      const one = purse.hold({ projectedCostUsd: 0.01, estimatedInputTokens: 100, maxOutputTokens: 20 });
      const two = purse.hold({ projectedCostUsd: 0.01, estimatedInputTokens: 100, maxOutputTokens: 20 });
      if (!one.ok || !two.ok || !one.hold.settleObserved || !two.hold.settleObserved) throw new Error("Both actual calls must be held.");
      let firstDone = false;
      let secondDone = false;
      const first = one.hold.settleObserved({ estimatedCostUsd: 0.003 }).then(() => { firstDone = true; });
      const second = two.hold.settleObserved({ estimatedCostUsd: 0.004 }).then(() => { secondDone = true; });
      await firstCalled;
      expect(firstDone).toBe(false);
      expect(secondDone).toBe(false);
      firstRelease();
      await first;
      await secondCalled;
      expect(firstDone).toBe(true);
      expect(secondDone).toBe(false);
      secondRelease();
      await second;
      expect(writes).toBe(2);
    });
    expect(await store.get(projectId, flowId)).toMatchObject({ spentUsd: 0.007, calls: 2 });
  } finally {
    firstRelease();
    secondRelease();
    replaced.mockRestore();
  }
}));

it("preserves a committed spend's original lost-ACK error and blocks second IO after independent reopen", async () => sqlAdmissionFixture(async sql => {
  const { store, projects, flows, owner } = await spendAt(sql.root, "sqlite");
  const resource = "owned.flow-spend:" + sql.root;
  const f = await observedSpend(sql, resource);
  const owned = await f.prepare(store, 0.007);
  const originalPut = SQLiteRepository.prototype.put;
  const error = new Error("actual spend commit acknowledgment lost");
  let writes = 0;
  const replaced = vi.spyOn(SQLiteRepository.prototype, "put").mockImplementation(async function (this: SQLiteRepository, record) {
    const result = await originalPut.call(this, record);
    if (record.id.endsWith("/creation-spend")) {
      writes++;
      throw error;
    }
    return result;
  });
  try {
    await expect(owned.invoke()).rejects.toBe(error);
  } finally { replaced.mockRestore(); }
  expect(writes).toBe(1);
  expect(await new AutomationStudioFlowBootstrapCreationSpendStore(projects, flows, owner).get(projectId, flowId)).toMatchObject({ spentUsd: 0.007, calls: 1 });
  await f.callbacks.flush();
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
  await f.assembly.consumer.release(f.reserved.reservation);
  await refusesReopen(sql, resource);
  expect(writes).toBe(1);
}));

it("does not certify a replaced project callback from fulfillment or reach native spend IO after it", async () => sqlAdmissionFixture(async sql => {
  const { projects, flows } = await spendAt(sql.root, "sqlite");
  const owner = new AutomationStudioProjectStore(projects);
  let calls = 0;
  owner.ensureProjectStructure = async function () {
    expect(this).toBe(owner);
    calls++;
  };
  const store = new AutomationStudioFlowBootstrapCreationSpendStore(projects, flows, owner);
  const f = await observedSpend(sql, "owned.flow-spend:" + sql.root);
  const owned = await f.prepare(store, 0.007);
  const puts = vi.spyOn(SQLiteRepository.prototype, "put");
  try {
    await expect(owned.invoke()).rejects.toThrow("flow_spend.callback_unverified");
    expect(puts.mock.calls.filter(([record]) => record.id.endsWith("/creation-spend"))).toHaveLength(0);
    expect(calls).toBe(1);
  } finally {
    puts.mockRestore();
    await f.assembly.consumer.release(f.reserved.reservation);
  }
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
}));
