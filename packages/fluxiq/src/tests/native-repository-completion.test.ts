// @fluxiq-test-group real-sql
import path from "node:path";
import sqlite3 from "sqlite3";
import { describe, expect, it } from "vitest";
import { SQLiteRepository, createRecord } from "../framework/persistence/sqlite/index.ts";
import { createSQLiteRepositoryExecutionPorts } from "../framework/persistence/sqlite/execution/index.ts";
import { subscribeFluxIQPerformanceMetrics } from "../framework/observability/performance/index.ts";
import type { FluxIQPerformanceMetric } from "../framework/observability/performance/types/index.ts";
import { ExecutionObservationSource, invokeExecutionCallbackRoot, type ExecutionCallbackObservation, type ExecutionCallbackRootLifecycle } from "../runtime/execution-observation/index.ts";
import { ExecutionCallbackPolicies } from "../runtime/execution-observation/policies/index.ts";
import type { ExecutionEntrySnapshot } from "../runtime/execution-admission/index.ts";
import { AutomationStudioProjectDatabasePool } from "../programs/automation-studio/storage/project/index.ts";
import { AutomationStudioProjectExecutionAdmissionStore } from "../programs/automation-studio/storage/project/execution-admission/index.ts";
import { sqlAdmissionAuthority, sqlAdmissionFixture } from "../programs/automation-studio/storage/project/execution-admission/tests/fixture.ts";

type SqlFixture = Parameters<Parameters<typeof sqlAdmissionFixture>[0]>[0];

async function nativeRoot<TResult>(store: SqlFixture["store"], resource: string, operation: (observation: ExecutionCallbackObservation) => Promise<TResult>, entered?: (entry: ExecutionEntrySnapshot) => void) {
  let callbacks!: ExecutionObservationSource;
  const actual = await sqlAdmissionAuthority(store, { series: true, resources: [resource], configure(assembly, scope, source) {
    callbacks = new ExecutionObservationSource(scope, "fixture.native-repository");
    source.delegatesTo.push(callbacks.owner);
    const registered = assembly.registerSource(callbacks.registration([callbacks.owner]));
    const producer = registered.producer;
    callbacks.connect(entered ? { ...registered, producer: { ...producer, enter: async (parent, origin, signal) => {
      const actualEntry = await producer.enter(parent, origin, signal);
      entered(assembly.entryBridge.read(actualEntry));
      return actualEntry;
    } } } : registered);
  } });
  let observation!: ExecutionCallbackObservation;
  const host = { run: () => operation(observation) };
  ExecutionCallbackPolicies.remember(host, host.run, "frame");
  ExecutionCallbackPolicies.manage(callbacks, { receiver: host, callback: host.run });
  const lifecycle: ExecutionCallbackRootLifecycle = {
    callbacks,
    reserve: async () => await actual.assembly.consumer.reserve(actual.scope, actual.grant),
    prepared: parent => { observation = callbacks.forParent(parent); },
    finish: async root => { await actual.ports.producer.finish(root, actual.source.complete(actual.origin)); },
    unverified: async root => { await actual.ports.producer.observe(root, actual.source.prove(actual.origin, { kind: "returned_unverified", completionDigest: "fixture.native.unverified" })); },
    interrupted: async (root, reason) => { await actual.ports.producer.interrupted(root, reason); },
    release: async reservation => { await actual.assembly.consumer.release(reservation); }
  };
  return { ...actual, callbacks, run: () => invokeExecutionCallbackRoot(lifecycle, { receiver: host, callback: host.run, args: [] }) };
}

function repository(root: string) {
  const original = new SQLiteRepository({ rootDir: path.join(root, "native"), kind: "fixture.native" });
  return { original, ports: createSQLiteRepositoryExecutionPorts(original), resource: "fixture.native:" + root };
}

async function assertReopenRefuses(sql: SqlFixture, resource: string): Promise<void> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: sql.root });
  const reopened = await AutomationStudioProjectExecutionAdmissionStore.open({ pool, projectId: "project.isolated" });
  try {
    const next = await sqlAdmissionAuthority(reopened, { series: true, resources: [resource], epoch: "epoch.changed", runId: "run.changed" });
    expect((await next.assembly.consumer.inspect(next.scope)).state).toBe("pending");
    await expect(next.assembly.consumer.reserve(next.scope, next.grant)).rejects.toThrow("execution_blocked");
  } finally {
    await reopened.close();
    await pool.closeAll();
  }
}

async function rawDatabase(file: string): Promise<sqlite3.Database> {
  return await new Promise<sqlite3.Database>((resolve, reject) => {
    const database = new sqlite3.Database(file, error => error ? reject(error) : resolve(database));
  });
}

async function rawRun(database: sqlite3.Database, sql: string): Promise<void> {
  await new Promise<void>((resolve, reject) => { database.run(sql, error => error ? reject(error) : resolve()); });
}

async function rawClose(database: sqlite3.Database): Promise<void> {
  await new Promise<void>((resolve, reject) => { database.close(error => error ? reject(error) : resolve()); });
}

describe("native repository actual durable completion", () => {
  it("closes the real native list/put frontier before closing the SQL-backed execution root", async () => sqlAdmissionFixture(async sql => {
    const { original, ports, resource } = repository(sql.root);
    const record = createRecord({ id: "one", kind: original.kind, data: { counter: 1 } });
    const f = await nativeRoot(sql.store, resource, async observation => {
      const written = await ports.put(record, observation);
      expect(written.data).toBe(record.data);
      return await ports.list(undefined, observation);
    });
    expect(await f.run()).toMatchObject([{ id: "one", data: { counter: 1 } }]);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
    expect((await new SQLiteRepository({ rootDir: original.rootDir, kind: original.kind }).list())[0]?.data).toEqual({ counter: 1 });
  }), 45_000);

  it("cannot complete or advance to its next callback while an actual external SQLite lock holds the write acknowledgement", async () => sqlAdmissionFixture(async sql => {
    const { original, ports, resource } = repository(sql.root);
    await original.put(createRecord({ id: "one", kind: original.kind, data: { counter: 0 } }));
    const lock = await rawDatabase(path.join(original.rootDir, "global.sqlite"));
    await rawRun(lock, "begin immediate");
    let unlock = true;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const listener = (metric: FluxIQPerformanceMetric): void => {
      if (metric.kind === "sql" && metric.repositoryKind === original.kind && metric.operation === "get") entered();
    };
    ExecutionCallbackPolicies.rememberLexical(listener, "pure");
    const unsubscribe = subscribeFluxIQPerformanceMetrics(listener);
    let nextCallbacks = 0;
    let settled = false;
    const f = await nativeRoot(sql.store, resource, async observation => {
      await ports.put(createRecord({ id: "one", kind: original.kind, data: { counter: 1 } }), observation);
      nextCallbacks++;
    });
    const running = f.run().then(() => { settled = true; });
    try {
      await started;
      await new Promise<void>(resolve => { setTimeout(resolve, 25); });
      expect(settled).toBe(false);
      expect(nextCallbacks).toBe(0);
      expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
      await rawRun(lock, "commit");
      unlock = false;
      await running;
      expect(nextCallbacks).toBe(1);
      expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
      expect((await original.get("one"))?.data).toEqual({ counter: 1 });
    } finally {
      unsubscribe();
      if (unlock) await rawRun(lock, "rollback");
      await rawClose(lock);
      await running;
    }
  }), 45_000);

  it("keeps same-file native queue order while a separately owned observed database completes", async () => sqlAdmissionFixture(async sql => {
    const { original, ports } = repository(sql.root);
    await original.put(createRecord({ id: "same", kind: original.kind, data: { counter: 0 } }));
    const lock = await rawDatabase(path.join(original.rootDir, "global.sqlite"));
    await rawRun(lock, "begin immediate");
    let locked = true;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const listener = (metric: FluxIQPerformanceMetric): void => {
      if (metric.kind === "sql" && metric.repositoryKind === original.kind && metric.databaseName === "global.sqlite" && metric.operation === "get") entered();
    };
    ExecutionCallbackPolicies.rememberLexical(listener, "pure");
    const unsubscribe = subscribeFluxIQPerformanceMetrics(listener);
    // These are the real legacy queue operations, never completion evidence for the observed resource.
    const one = original.put(createRecord({ id: "same", kind: original.kind, data: { counter: 1 } }))
      .then(value => ({ kind: "fulfilled" as const, value }), error => ({ kind: "rejected" as const, error: error as unknown }));
    let secondCompleted = false;
    const two = original.put(createRecord({ id: "same", kind: original.kind, data: { counter: 2 } }))
      .then(value => {
        secondCompleted = true;
        return { kind: "fulfilled" as const, value };
      }, error => ({ kind: "rejected" as const, error: error as unknown }));
    try {
      await started;
      const resource = "fixture.native:" + path.join(original.rootDir, "domains", "another.sqlite");
      const f = await nativeRoot(sql.store, resource, observation => ports.put(createRecord({ id: "independent", kind: original.kind, scope: { domainId: "another" }, data: { counter: 3 } }), observation));
      const independent = await f.run();
      expect(independent.data).toEqual({ counter: 3 });
      expect(secondCompleted).toBe(false);
      expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
      await rawRun(lock, "commit");
      locked = false;
      const results = await Promise.all([one, two]);
      for (const result of results) if (result.kind === "rejected") throw result.error;
      expect(results.map(result => result.kind === "fulfilled" ? result.value.data.counter : undefined)).toEqual([1, 2]);
      expect((await original.get("same"))?.data).toEqual({ counter: 2 });
      expect((await original.get("independent", { domainId: "another" }))?.data).toEqual({ counter: 3 });
      expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
    } finally {
      unsubscribe();
      if (locked) await rawRun(lock, "rollback");
      await rawClose(lock);
      const drained = await Promise.all([one, two]);
      for (const result of drained) if (result.kind === "rejected") throw result.error;
    }
  }), 45_000);

  it("refuses a same-root sibling before a second SQL write and drains the original admitted operation", async () => sqlAdmissionFixture(async sql => {
    const { original, ports, resource } = repository(sql.root);
    await original.put(createRecord({ id: "same", kind: original.kind, data: { counter: 0 } }));
    const lock = await rawDatabase(path.join(original.rootDir, "global.sqlite"));
    await rawRun(lock, "begin immediate");
    let locked = true;
    let admitted!: () => void;
    let refused!: () => void;
    const nativeWriteAdmitted = new Promise<void>(resolve => { admitted = resolve; });
    const siblingRefused = new Promise<void>(resolve => { refused = resolve; });
    const depths = new Map<string, number>();
    let nativeStages = 0;
    const entered = (entry: ExecutionEntrySnapshot): void => {
      const depth = (depths.get(entry.row.parentId ?? "") ?? 0) + 1;
      depths.set(entry.row.entryId, depth);
      // Actual durable entries: host=1, native operation=2, native stages=3.
      if (depth === 3 && ++nativeStages === 4) admitted();
    };
    let siblingError: unknown;
    let originalOutcome: { kind: "fulfilled"; value: unknown } | { kind: "rejected"; error: unknown } | undefined;
    const f = await nativeRoot(sql.store, resource, async observation => {
      const one = ports.put(createRecord({ id: "same", kind: original.kind, data: { counter: 1 } }), observation)
        .then(value => ({ kind: "fulfilled" as const, value }), error => ({ kind: "rejected" as const, error: error as unknown }));
      await nativeWriteAdmitted;
      // Let the admitted stage invoke its original synchronous native submission; the external lock holds its ACK.
      await new Promise<void>(resolve => { setImmediate(resolve); });
      const second = await ports.put(createRecord({ id: "same", kind: original.kind, data: { counter: 2 } }), observation)
        .then(value => ({ kind: "fulfilled" as const, value }), error => ({ kind: "rejected" as const, error: error as unknown }));
      expect(second.kind).toBe("rejected");
      if (second.kind !== "rejected") throw new Error("A pending sibling must not admit a second write.");
      siblingError = second.error;
      refused();
      originalOutcome = await one;
      if (originalOutcome.kind === "rejected") throw new AggregateError([second.error, originalOutcome.error], "The refused sibling and interrupted original completion are both retained.", { cause: second.error });
      throw second.error;
    }, entered);
    const running = f.run().then(value => ({ kind: "fulfilled" as const, value }), error => ({ kind: "rejected" as const, error: error as unknown }));
    try {
      await siblingRefused;
      expect(siblingError).toBeInstanceOf(Error);
      expect((siblingError as Error).message).toBe("execution_admission.child_blocked");
      expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
      await rawRun(lock, "commit");
      locked = false;
      const result = await running;
      expect(result.kind).toBe("rejected");
      expect(originalOutcome).toBeDefined();
      expect((await original.get("same"))?.data).toEqual({ counter: 1 });
      expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
      await assertReopenRefuses(sql, resource);
      expect((await original.get("same"))?.data).toEqual({ counter: 1 });
    } finally {
      if (locked) await rawRun(lock, "rollback");
      await rawClose(lock);
      await running;
    }
  }), 45_000);

  it("preserves a post-write listener error and actual row, withholding completion and second IO across reopen", async () => sqlAdmissionFixture(async sql => {
    const { original, ports, resource } = repository(sql.root);
    const primary = new Error("actual post-write acknowledgement lost");
    let writes = 0;
    const listener = (metric: FluxIQPerformanceMetric): void => {
      if (metric.kind === "sql" && metric.repositoryKind === original.kind && metric.operation === "run" && metric.rowsChanged === 1) {
        writes++;
        throw primary;
      }
    };
    ExecutionCallbackPolicies.rememberLexical(listener, "pure");
    const unsubscribe = subscribeFluxIQPerformanceMetrics(listener);
    let nextCallbacks = 0;
    const f = await nativeRoot(sql.store, resource, async observation => {
      await ports.put(createRecord({ id: "one", kind: original.kind, data: { counter: 1 } }), observation);
      nextCallbacks++;
    });
    try {
      await expect(f.run()).rejects.toBe(primary);
    } finally { unsubscribe(); }
    expect(writes).toBe(1);
    expect(nextCallbacks).toBe(0);
    expect((await original.get("one"))?.data).toEqual({ counter: 1 });
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
    await assertReopenRefuses(sql, resource);
    expect(writes).toBe(1);
    expect(nextCallbacks).toBe(0);
  }), 45_000);

  it("does not credit an unsupported fulfilled subscriber or reach the later write, including after a new epoch", async () => sqlAdmissionFixture(async sql => {
    const { original, ports, resource } = repository(sql.root);
    await original.put(createRecord({ id: "one", kind: original.kind, data: { counter: 0 } }));
    let unsupportedCalls = 0;
    const unsupported = (metric: FluxIQPerformanceMetric): void => {
      if (metric.kind === "sql" && metric.repositoryKind === original.kind) unsupportedCalls++;
    };
    const unsubscribe = subscribeFluxIQPerformanceMetrics(unsupported);
    const f = await nativeRoot(sql.store, resource, observation => ports.put(createRecord({ id: "one", kind: original.kind, data: { counter: 1 } }), observation));
    try {
      await expect(f.run()).rejects.toThrow("telemetry_incomplete");
    } finally { unsubscribe(); }
    expect(unsupportedCalls).toBe(1);
    expect((await original.get("one"))?.data).toEqual({ counter: 0 });
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
    await assertReopenRefuses(sql, resource);
    expect(unsupportedCalls).toBe(1);
  }), 45_000);
});
