// @fluxiq-test-group real-sql
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sqlite3 from "sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observationFixture } from "../../../../../runtime/execution-observation/tests/fixture.ts";
import { ExecutionCallbackPolicies } from "../../../../../runtime/execution-observation/policies/index.ts";
import { subscribeFluxIQPerformanceMetrics } from "../../../../observability/performance/index.ts";
import type { FluxIQPerformanceMetric } from "../../../../observability/performance/types/index.ts";
import { createRecord, SQLiteConnectionPool, SQLiteRepository } from "../../index.ts";
import { createSQLiteRepositoryExecutionPorts } from "../index.ts";

const roots: string[] = [];

async function newRepository() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "native-repository-"));
  roots.push(rootDir);
  return new SQLiteRepository({ rootDir, kind: "fixture.native" });
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("native-repository-")) throw new Error("Invalid native fixture cleanup path.");
    await rm(root, { recursive: true, force: true });
  }
});

describe("original native repository capability", () => {
  it("completes real list and put callbacks plus close without changing envelope data or scope", async () => {
    const repository = await newRepository();
    const ports = createSQLiteRepositoryExecutionPorts(repository);
    const f = await observationFixture();
    const record = createRecord({ id: "one", kind: "caller.kind", scope: { domainId: "isolated.domain" }, data: { actual: true, nested: { count: 3 } } });
    const stored = await ports.put(record, f.observation);
    expect(ports.original).toBe(repository);
    expect(Object.keys(ports)).toEqual(["original", "list", "put"]);
    expect(stored.data).toBe(record.data);
    expect(stored.scope).toEqual(record.scope);
    expect(stored.kind).toBe(repository.kind);
    expect(await ports.list(record.scope, f.observation)).toEqual([stored]);
    await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
    await f.authority.consumer.release(f.reserved.reservation);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
    expect(await repository.list(record.scope)).toEqual([stored]);
  });

  it("creates actual SQLite storage for an empty observed list rather than granting an empty read receipt", async () => {
    const repository = await newRepository();
    const ports = createSQLiteRepositoryExecutionPorts(repository);
    const f = await observationFixture();
    expect(await ports.list(undefined, f.observation)).toEqual([]);
    const bytes = await readFile(path.join(repository.rootDir, "global.sqlite"));
    expect(bytes.subarray(0, 16).toString("binary")).toBe("SQLite format 3\0");
    expect([...f.store.rows.values()].filter(row => !row.closed)).toHaveLength(1);
  });

  it("denies prototype copies and subclass instances despite their matching method names", async () => {
    const original = await newRepository();
    const copy = Object.assign(Object.create(SQLiteRepository.prototype), original);
    expect(() => createSQLiteRepositoryExecutionPorts(copy)).toThrow("foreign_repository");
    class SuppliedRepository extends SQLiteRepository {}
    const subclass = new SuppliedRepository({ rootDir: original.rootDir, kind: original.kind });
    expect(() => createSQLiteRepositoryExecutionPorts(subclass)).toThrow("unsupported_repository");
    await expect(access(path.join(original.rootDir, "global.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("denies the actual pooled route rather than crediting an unimplemented pool completion", async () => {
    const original = await newRepository();
    const pooled = new SQLiteRepository({ rootDir: original.rootDir, kind: original.kind, connections: new SQLiteConnectionPool() });
    expect(() => createSQLiteRepositoryExecutionPorts(pooled)).toThrow("unsupported_repository");
    await expect(access(path.join(original.rootDir, "global.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("pins original methods and rejects a later replacement before invoking it or native IO", async () => {
    const original = await newRepository();
    const ports = createSQLiteRepositoryExecutionPorts(original);
    const f = await observationFixture();
    const replaced = vi.spyOn(original, "list").mockResolvedValue([]);
    await expect(ports.list(undefined, f.observation)).rejects.toThrow("repository_changed");
    expect(replaced).not.toHaveBeenCalled();
    await expect(access(path.join(original.rootDir, "global.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses accessor substitution without executing the supplied accessor", async () => {
    const original = await newRepository();
    const ports = createSQLiteRepositoryExecutionPorts(original);
    const f = await observationFixture();
    let reads = 0;
    Object.defineProperty(original, "connections", { configurable: true, get() {
      reads++;
      return undefined;
    } });
    await expect(ports.list(undefined, f.observation)).rejects.toThrow("unsupported_repository");
    expect(reads).toBe(0);
  });

  it("requires the original port receiver and does not register copied receivers as frames", async () => {
    const original = await newRepository();
    const ports = createSQLiteRepositoryExecutionPorts(original);
    const copied = { ...ports };
    const f = await observationFixture();
    expect(ExecutionCallbackPolicies.isOwningFrame(ports, ports.list)).toBe(true);
    expect(ExecutionCallbackPolicies.isOwningFrame(copied, copied.list)).toBe(false);
    await expect(copied.list(undefined, f.observation)).rejects.toThrow("foreign_ports");
    await expect(access(path.join(original.rootDir, "global.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("denies a replaced close transport before opening or writing", async () => {
    const original = await newRepository();
    const ports = createSQLiteRepositoryExecutionPorts(original);
    const f = await observationFixture();
    const replaced = vi.spyOn(sqlite3.Database.prototype, "close").mockImplementation(() => { throw new Error("must not invoke replacement"); });
    await expect(ports.put(createRecord({ id: "one", kind: original.kind, data: {} }), f.observation)).rejects.toThrow("native_driver_changed");
    expect(replaced).not.toHaveBeenCalled();
    await expect(access(path.join(original.rootDir, "global.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["date", "monotonic"] as const)("rejects a substituted %s clock accessor without invoking it", async kind => {
    const original = await newRepository();
    const ports = createSQLiteRepositoryExecutionPorts(original);
    const f = await observationFixture();
    const target = kind === "date" ? Date : performance;
    const descriptor = Object.getOwnPropertyDescriptor(target, "now");
    const now = target.now;
    let accessorCalls = 0;
    let outcome: { value: unknown } | { error: unknown };
    Object.defineProperty(target, "now", { configurable: true, get() {
      accessorCalls++;
      return now;
    } });
    try {
      outcome = await ports.list(undefined, f.observation).then(value => ({ value }), error => ({ error: error as unknown }));
    } finally {
      if (descriptor) Object.defineProperty(target, "now", descriptor);
      else Reflect.deleteProperty(target, "now");
    }
    expect(accessorCalls).toBe(0);
    expect(outcome).toMatchObject({ error: expect.objectContaining({ message: expect.stringContaining("native_driver_changed") }) });
    await expect(access(path.join(original.rootDir, "global.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses an omitted observation instead of taking the generic unobserved compatibility route", async () => {
    const original = await newRepository();
    const ports = createSQLiteRepositoryExecutionPorts(original);
    await expect(Reflect.apply(ports.list, ports, [undefined, undefined])).rejects.toThrow("observation_required");
    await expect(access(path.join(original.rootDir, "global.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a clock replaced while the actual native write acknowledgement is held, without calling it", async () => {
    const original = await newRepository();
    await original.put(createRecord({ id: "one", kind: original.kind, data: { count: 0 } }));
    const ports = createSQLiteRepositoryExecutionPorts(original);
    const f = await observationFixture();
    const lock = await new Promise<sqlite3.Database>((resolve, reject) => {
      const db = new sqlite3.Database(path.join(original.rootDir, "global.sqlite"), error => error ? reject(error) : resolve(db));
    });
    const rawRun = async (sql: string): Promise<void> => {
      await new Promise<void>((resolve, reject) => { lock.run(sql, error => error ? reject(error) : resolve()); });
    };
    await rawRun("begin immediate");
    let locked = true;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const listener = (metric: FluxIQPerformanceMetric): void => {
      if (metric.kind === "sql" && metric.repositoryKind === original.kind && metric.operation === "get") entered();
    };
    ExecutionCallbackPolicies.rememberLexical(listener, "pure");
    const unsubscribe = subscribeFluxIQPerformanceMetrics(listener);
    const running = ports.put(createRecord({ id: "one", kind: original.kind, data: { count: 1 } }), f.observation)
      .then(value => ({ value }), error => ({ error: error as unknown }));
    const monotonic = performance.now;
    const monotonicDescriptor = Object.getOwnPropertyDescriptor(performance, "now");
    const restoreMonotonic = (): void => {
      if (monotonicDescriptor) Object.defineProperty(performance, "now", monotonicDescriptor);
      else Reflect.deleteProperty(performance, "now");
    };
    let clockCalls = 0;
    try {
      await started;
      await new Promise<void>(resolve => { setTimeout(resolve, 25); });
      Object.defineProperty(performance, "now", { configurable: true, writable: true, value: () => {
        clockCalls++;
        return monotonic.call(performance);
      } });
      await rawRun("commit");
      locked = false;
      const outcome = await running;
      restoreMonotonic();
      expect(clockCalls).toBe(0);
      expect(outcome).toMatchObject({ error: expect.objectContaining({ message: expect.stringContaining("native_driver_changed") }) });
      expect((await original.get("one"))?.data).toEqual({ count: 1 });
      expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
      await expect(ports.put(createRecord({ id: "one", kind: original.kind, data: { count: 2 } }), f.observation)).rejects.toThrow("pending_interruption");
      expect((await original.get("one"))?.data).toEqual({ count: 1 });
    } finally {
      restoreMonotonic();
      unsubscribe();
      if (locked) await rawRun("rollback");
      await new Promise<void>((resolve, reject) => { lock.close(error => error ? reject(error) : resolve()); });
      await running;
    }
  }, 45_000);

  it("denies copied, foreign-parent and stale observations before new native IO", async () => {
    const original = await newRepository();
    const ports = createSQLiteRepositoryExecutionPorts(original);
    const f = await observationFixture();
    await expect(ports.list(undefined, { ...f.observation } as typeof f.observation)).rejects.toThrow("foreign_binding");
    const other = await observationFixture();
    await expect(ports.list(undefined, f.source.forParent(other.parent))).rejects.toThrow();
    await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
    await f.authority.consumer.release(f.reserved.reservation);
    await expect(ports.list(undefined, f.observation)).rejects.toThrow("reservation_not_active");
    await expect(access(path.join(original.rootDir, "global.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
