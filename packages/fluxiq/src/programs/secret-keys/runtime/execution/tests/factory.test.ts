// @fluxiq-test-group real-sql
import { expect, it } from "vitest";
import { access } from "node:fs/promises";
import path from "node:path";
import { SecretKeysService } from "../../service.ts";
import type { HeldRevealAuthorization } from "../../held-keys.ts";
import { createSecretKeysExecutionPorts } from "../index.ts";
import { nativeSecretFixture } from "./fixture.ts";

it("revalidates normal preloaded create/unlock state with real native SQL and returns only after reveal ACK", async () => {
  const f = await nativeSecretFixture();
  const original = f.store.require(f.key!.id);
  const held = f.heldKeys.session("session.unit")!.decryptionKeys.get(f.key!.id)!.decryptionKey;
  const owned = await f.model();
  await expect(owned.invoke()).resolves.toBe("unit-native-owned-value");
  expect(owned.completion()).toBe("settled");
  expect(f.sends()).toBe(1);
  expect(f.service.activeRevealAuthorizationCount()).toBe(0);
  expect(held.some(byte => byte !== 0)).toBe(true);
  expect(f.store.require(f.key!.id).sealed).toBe(original.sealed);
  expect(JSON.stringify(await f.service.snapshot())).not.toContain("unit-native-owned-value");
  await expect(f.finish()).resolves.toMatchObject({ state: "clear" });
});

it("preserves legacy synchronous unlock/revoke and one-use rich authorization shapes", async () => {
  const f = await nativeSecretFixture();
  expect(f.service.unlockedSessionFor("actor.unit")).toBe("session.unit");
  const authorization = await f.native.createSessionRevealAuthorization({ id: f.key!.id, sessionId: "session.unit", userId: "actor.unit", ttlMs: 10000 }, f.observation);
  const held = f.heldKeys.authorization(authorization.authorizationId)!;
  expect(authorization).toMatchObject({ keyId: f.key!.id, remainingUses: 1 });
  expect(f.service.revokeRevealAuthorization(authorization.authorizationId)).toBeUndefined();
  expect(held.decryptionKey.every(byte => byte === 0)).toBe(true);
  await expect(f.native.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: f.key!.id }, f.observation)).rejects.toThrow("unavailable");
  expect(f.sends()).toBe(0);
  await expect(f.finish()).resolves.toMatchObject({ state: "clear" });
});

it("rejects Service copies, proxies and subclass factories without invoking property traps", async () => {
  const f = await nativeSecretFixture();
  const copy = Object.assign(Object.create(SecretKeysService.prototype), f.service);
  expect(() => createSecretKeysExecutionPorts(copy)).toThrow();
  let traps = 0;
  const proxy = new Proxy(f.service, {
    getOwnPropertyDescriptor() {
      traps++;
      throw new Error("must not reflect a foreign receiver");
    },
    getPrototypeOf() {
      traps++;
      return SecretKeysService.prototype;
    }
  });
  expect(() => createSecretKeysExecutionPorts(proxy)).toThrow();
  expect(traps).toBe(0);
  class SuppliedService extends SecretKeysService {}
  const supplied = new SuppliedService();
  try { expect(() => createSecretKeysExecutionPorts(supplied)).toThrow("unsupported_service"); }
  finally { supplied.close(); }
});

it("refuses an observed native Service getter before it runs", async () => {
  const f = await nativeSecretFixture();
  const original = Object.getOwnPropertyDescriptor(f.service, "snapshot");
  let getters = 0;
  Object.defineProperty(f.service, "snapshot", { configurable: true, get() {
    getters++;
    return SecretKeysService.prototype.snapshot;
  } });
  try {
    const owned = await f.model();
    await expect(owned.invoke()).rejects.toThrow("native_accessor_unverified");
    expect(getters).toBe(0);
    expect(f.sends()).toBe(0);
  } finally {
    if (original) Object.defineProperty(f.service, "snapshot", original);
    else Reflect.deleteProperty(f.service, "snapshot");
  }
});

it("observes a supplied replacement by its original receiver and refuses its unverified return before later work", async () => {
  const f = await nativeSecretFixture();
  let counters = 0;
  f.service.snapshot = async function () {
    expect(this).toBe(f.service);
    counters++;
    return await SecretKeysService.prototype.snapshot.call(this);
  };
  const owned = await f.model();
  await expect(owned.invoke()).rejects.toThrow("model.secret.completion_unknown");
  expect(counters).toBe(1);
  expect(f.sends()).toBe(0);
  expect(f.service.activeRevealAuthorizationCount()).toBe(0);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
  await expect(f.native.snapshot(f.observation)).rejects.toThrow();
  expect(counters).toBe(1);
});

it("rejects copied observations and copied native port receivers before new SQL", async () => {
  const f = await nativeSecretFixture({ seed: false });
  const originalRows = f.store.list();
  await expect(Reflect.apply(f.native.snapshot, f.native, [{ ...f.observation }])).rejects.toThrow();
  const copy = Object.assign(Object.create(Object.getPrototypeOf(f.native)), f.native);
  expect(() => Reflect.apply(f.native.snapshot, copy, [f.observation])).toThrow();
  expect(f.store.list()).toEqual(originalRows);
  expect(f.sends()).toBe(0);
  expect(f.history.rows.size).toBe(1);
  await expect(access(path.join(f.repository.rootDir, "global.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("stops an unsupported injected clock before custody or provider dispatch", async () => {
  let reads = 0;
  const clock = () => {
    reads++;
    return 1000;
  };
  const f = await nativeSecretFixture({ now: clock, declareClock: false });
  reads = 0;
  const owned = await f.model();
  await expect(owned.invoke()).rejects.toThrow("coverage_unknown");
  expect(reads).toBe(1);
  expect(f.service.activeRevealAuthorizationCount()).toBe(0);
  expect(f.sends()).toBe(0);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});

it("refuses a native custody accessor without calling it or creating an authorization", async () => {
  const f = await nativeSecretFixture();
  let getters = 0;
  Object.defineProperty(f.heldKeys, "sessionsFor", { configurable: true, get() {
    getters++;
    throw new Error("must not invoke an unobserved custody accessor");
  } });
  try {
    const owned = await f.model();
    await expect(owned.invoke()).rejects.toThrow("custody_accessor_unverified");
    expect(getters).toBe(0);
    expect(f.sends()).toBe(0);
    expect(f.service.activeRevealAuthorizationCount()).toBe(0);
  } finally { Reflect.deleteProperty(f.heldKeys, "sessionsFor"); }
});

it("cleans the exact produced grant if durable completion fails without issuing it to the caller", async () => {
  const f = await nativeSecretFixture();
  await f.native.snapshot(f.observation);
  const paused = f.history.pauseNext("finish");
  const failure = f.history.failNext("finish");
  const cleanupFailure = f.history.failNext("release");
  const running = f.native.createSessionRevealAuthorization({ id: f.key!.id, sessionId: "session.unit", userId: "actor.unit", ttlMs: 10000 }, f.observation).then(value => ({ value }), error => ({ error: error as unknown }));
  await paused.entered;
  const grants = Object.getOwnPropertyDescriptor(f.heldKeys, "authorizations")?.value as Map<string, HeldRevealAuthorization>;
  expect(grants.size).toBe(1);
  const grant = [...grants.values()][0]!;
  expect(grant.decryptionKey.some(byte => byte !== 0)).toBe(true);
  paused.release();
  const outcome = await running;
  const includes = (error: unknown): boolean => error === failure || (error instanceof AggregateError && error.errors.some(includes));
  expect("error" in outcome && includes(outcome.error)).toBe(true);
  expect(f.service.activeRevealAuthorizationCount()).toBe(0);
  expect(grant.decryptionKey.every(byte => byte === 0)).toBe(true);
  expect(f.service.activeSessionUnlockCount()).toBe(1);
  expect(f.sends()).toBe(0);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
  await expect(f.release()).rejects.toBe(cleanupFailure);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});
