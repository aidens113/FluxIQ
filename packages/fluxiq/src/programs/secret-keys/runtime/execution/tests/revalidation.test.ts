// @fluxiq-test-group real-sql
import { expect, it } from "vitest";
import { ExecutionCallbackPolicies } from "../../../../../runtime/execution-observation/index.ts";
import { observationFixture } from "../../../../../runtime/execution-observation/tests/fixture.ts";
import { subscribeFluxIQPerformanceMetrics } from "../../../../../framework/observability/performance/index.ts";
import type { FluxIQPerformanceMetric } from "../../../../../framework/observability/performance/types/index.ts";
import { SecretKeysService } from "../../service.ts";
import { createSecretKeysExecutionPorts } from "../index.ts";
import { nativeSecretFixture } from "./fixture.ts";
import { secretWriteStarted } from "./write-start.ts";
import { reserveReopenedSecretScope } from "./reopen.ts";

it("shares one actual observed cold read without moving its original parent to the later caller", async () => {
  const f = await nativeSecretFixture();
  const cold = new SecretKeysService({ repository: f.repository, repositoryExecution: f.repositoryExecution, heldKeys: f.heldKeys, passwordKdf: { testOnlyWeakParameters: { N: 1024, r: 8, p: 1, keyLength: 32 } } });
  const ports = createSecretKeysExecutionPorts(cold);
  const other = await observationFixture();
  let reads = 0;
  const listener = (metric: FluxIQPerformanceMetric): void => {
    if (metric.kind === "sql" && metric.repositoryKind === f.repository.kind && metric.operation === "all") reads++;
  };
  ExecutionCallbackPolicies.rememberLexical(listener, "pure");
  const unsubscribe = subscribeFluxIQPerformanceMetrics(listener);
  try {
    const values = await Promise.all([ports.snapshot(f.observation), ports.snapshot(other.observation)]);
    expect(values[0]).toEqual(values[1]);
    expect(values[0]!.keys).toHaveLength(1);
    expect(reads).toBe(1);
    expect(other.store.rows.size).toBe(2);
    expect(f.history.rows.size).toBeGreaterThan(other.store.rows.size);
    await other.rootPorts.producer.finish(other.reserved.root, other.root.complete(other.origin));
    await expect(f.finish()).resolves.toMatchObject({ state: "clear" });
  } finally {
    unsubscribe();
    cold.close({ mode: "evict" });
    await other.authority.consumer.release(other.reserved.reservation);
  }
});

it("waits the original queued write prefix before entering a new observed preload read", async () => {
  const f = await nativeSecretFixture();
  const unlock = await f.lock();
  const write = secretWriteStarted(f.repository.kind);
  const updating = f.service.updateKey({ id: f.key!.id, name: "Updated unit key", nowMs: 2000 });
  let reading: Promise<unknown> | undefined;
  try {
    await write.started;
    const current = f.store.require(f.key!.id);
    reading = f.native.snapshot(f.observation);
    await new Promise<void>(resolve => { setImmediate(resolve); });
    expect(f.history.rows.size).toBe(2);
    expect(f.sends()).toBe(0);
    await unlock();
    await updating;
    await expect(reading).resolves.toMatchObject({ keys: [{ id: f.key!.id, name: "Updated unit key" }] });
    expect(f.store.require(f.key!.id)).toBe(current);
    await expect(f.finish()).resolves.toMatchObject({ state: "clear" });
  } finally {
    write.unsubscribe();
    await unlock();
    await updating;
    if (reading) await reading;
  }
});

it("compares every guarded record field and preserves cache object identity instead of overwriting a mismatch", async () => {
  const f = await nativeSecretFixture();
  const original = f.store.require(f.key!.id);
  const row = await f.repository.get(f.key!.id);
  if (!row) throw new Error("Actual native row is missing.");
  await f.repository.put({ ...row, data: { ...row.data, lastRotatedAtMs: 1234 } });
  const owned = await f.model();
  await expect(owned.invoke()).rejects.toThrow("cache_revalidation_changed");
  expect(f.store.require(f.key!.id)).toBe(original);
  expect(f.store.require(f.key!.id).lastRotatedAtMs).not.toBe(1234);
  expect(f.sends()).toBe(0);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});

it("detects an in-place cache mutation during the actual native read even without a set-generation change", async () => {
  const f = await nativeSecretFixture();
  const record = f.store.require(f.key!.id);
  let mutations = 0;
  const completed = new WeakSet<Promise<void>>();
  const listener = (metric: FluxIQPerformanceMetric): Promise<void> => {
    const original = Promise.resolve().then(() => {
      if (metric.kind === "sql" && metric.repositoryKind === f.repository.kind && metric.operation === "all" && mutations === 0) {
        record.sealed.ciphertext = "controlled-unit-mutation";
        mutations++;
      }
      completed.add(original);
    });
    return original;
  };
  ExecutionCallbackPolicies.rememberManaged({ receiver: undefined, callback: listener, contract: "managed_direct_effects", consumeCompletion: input => input.returned && completed.delete(input.returned) && input.outcome.kind === "fulfilled"
    ? { disposition: "settled", completionDigest: "test.original_cache_mutation.finished", assessmentDigest: "test.actual_metric_callback.quiescent" } : null });
  const unsubscribe = subscribeFluxIQPerformanceMetrics(listener);
  try {
    await expect(f.native.snapshot(f.observation)).rejects.toThrow("cache_revalidation_changed");
    expect(mutations).toBe(1);
    expect(f.store.require(f.key!.id)).toBe(record);
    expect(f.sends()).toBe(0);
    await expect(f.native.snapshot(f.observation)).rejects.toThrow();
  } finally { unsubscribe(); }
});

it("does not use a later row read to clear an observed unknown load or reopened pending history", async () => {
  const f = await nativeSecretFixture();
  let effects = 0;
  const listener = (metric: FluxIQPerformanceMetric): void => {
    if (metric.kind === "sql" && metric.repositoryKind === f.repository.kind) effects++;
  };
  const unsubscribe = subscribeFluxIQPerformanceMetrics(listener);
  try { await expect(f.native.snapshot(f.observation)).rejects.toThrow(); }
  finally { unsubscribe(); }
  expect(effects).toBe(1);
  expect(f.sends()).toBe(0);
  await expect(f.native.snapshot(f.observation)).rejects.toThrow();
  await f.release();
  await expect(reserveReopenedSecretScope(f.history)).rejects.toThrow();
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});
