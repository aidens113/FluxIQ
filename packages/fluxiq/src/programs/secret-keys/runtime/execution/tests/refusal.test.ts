// @fluxiq-test-group real-sql
import { expect, it } from "vitest";
import { SecretProviderKeyRefusalError } from "../../../../../runtime/models/secrets/execution/dispatch/index.ts";
import { nativeSecretFixture } from "./fixture.ts";

it("falls back from the genuinely completed expired native session to the person's actual live unlock", async () => {
  let now = 1000;
  const f = await nativeSecretFixture({ now: () => now });
  await f.service.unlockSession({ sessionId: "session.expired", userId: "actor.unit", authorizationPassword: "unit-password", expiresAtMs: 2000, nowMs: 1000 });
  const expired = f.heldKeys.session("session.expired")!.decryptionKeys.get(f.key!.id)!.decryptionKey;
  now = 2500;
  const owned = await f.model("session.expired");
  await expect(owned.invoke()).resolves.toBe("unit-native-owned-value");
  expect(f.sends()).toBe(1);
  expect(f.heldKeys.session("session.expired")).toBeUndefined();
  expect(expired.every(byte => byte === 0)).toBe(true);
  expect(f.heldKeys.session("session.unit")).toBeDefined();
  expect(owned.completion()).toBe("settled");
  await expect(f.finish()).resolves.toMatchObject({ state: "clear" });
});

it("preserves an original infrastructure throw during native authorization without false locked fallback", async () => {
  const failure = new Error("controlled original clock failure");
  let observing = false;
  let reads = 0;
  const f = await nativeSecretFixture({ now: () => {
    if (observing && ++reads === 2) throw failure;
    return 1000;
  } });
  observing = true;
  const owned = await f.model("session.absent");
  await expect(owned.invoke()).rejects.toBe(failure);
  expect(reads).toBe(2);
  expect(f.sends()).toBe(0);
  expect(f.service.activeRevealAuthorizationCount()).toBe(0);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});

it("does not treat a typed-looking unsupported thrown error as completed native business refusal", async () => {
  const original = new Error("controlled typed-looking error");
  original.name = "SecretProviderKeyRefusalError";
  let getterCalls = 0;
  Object.defineProperty(original, "completedFor", { get() {
    getterCalls++;
    return () => true;
  } });
  let observing = false;
  let reads = 0;
  const f = await nativeSecretFixture({ now: () => {
    if (observing && ++reads === 2) throw original;
    return 1000;
  } });
  observing = true;
  const owned = await f.model("session.absent");
  await expect(owned.invoke()).rejects.toBe(original);
  expect(getterCalls).toBe(0);
  expect(reads).toBe(2);
  expect(f.sends()).toBe(0);
});

it("binds refusal information to its private owner, actual child and exact public Promise, ignoring copies and getters", async () => {
  const f = await nativeSecretFixture();
  const foreign = await nativeSecretFixture({ seed: false });
  const returned = f.native.createSessionRevealAuthorization({ id: f.key!.id, userId: "actor.unit", sessionId: "session.absent", ttlMs: 10000 }, f.observation);
  const error = await returned.then(() => { throw new Error("Expected actual native refusal."); }, actual => actual as unknown);
  if (!SecretProviderKeyRefusalError.owns(error)) throw new Error("Original native refusal is missing.");
  let getters = 0;
  Object.defineProperty(error, "completedFor", { get() {
    getters++;
    return () => true;
  } });
  expect(f.native.isCompletedRefusal(error, returned)).toBe(true);
  const copy = Object.assign(Object.create(Object.getPrototypeOf(error)), error);
  expect(f.native.isCompletedRefusal(copy, returned)).toBe(false);
  expect(foreign.native.isCompletedRefusal(error, returned)).toBe(false);
  const wrapped = returned.then(value => value, actual => { throw actual; });
  await expect(wrapped).rejects.toBe(error);
  expect(f.native.isCompletedRefusal(error, wrapped)).toBe(false);
  expect(getters).toBe(0);
  await expect(f.finish()).resolves.toMatchObject({ state: "clear" });
});

it("rejects a genuine earlier refusal replayed by a later native callback instead of using the old settled child", async () => {
  let observing = false;
  let reads = 0;
  let earlier: unknown;
  const f = await nativeSecretFixture({ now: () => {
    if (observing && ++reads === 2) throw earlier;
    return 1000;
  } });
  const returned = f.native.createSessionRevealAuthorization({ id: f.key!.id, userId: "actor.unit", sessionId: "session.absent", ttlMs: 10000 }, f.observation);
  earlier = await returned.then(() => { throw new Error("Expected original native refusal."); }, error => error as unknown);
  expect(f.native.isCompletedRefusal(earlier, returned)).toBe(true);
  observing = true;
  const owned = await f.model("session.absent");
  await expect(owned.invoke()).rejects.toBe(earlier);
  expect(reads).toBe(2);
  expect(f.sends()).toBe(0);
  expect(f.service.activeRevealAuthorizationCount()).toBe(0);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});
