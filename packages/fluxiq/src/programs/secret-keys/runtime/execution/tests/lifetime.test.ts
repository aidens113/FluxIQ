// @fluxiq-test-group real-sql
import { expect, it, vi } from "vitest";
import { nativeSecretFixture } from "./fixture.ts";
import { secretWriteStarted } from "./write-start.ts";
import { reserveReopenedSecretScope } from "./reopen.ts";

it("keeps the exact claim and copied key pending until the real native put ACK", async () => {
  const f = await nativeSecretFixture();
  await f.native.snapshot(f.observation);
  const authorization = await f.native.createSessionRevealAuthorization({ id: f.key!.id, userId: "actor.unit", sessionId: "session.unit", ttlMs: 10000 }, f.observation);
  const held = f.heldKeys.authorization(authorization.authorizationId)!;
  const unlock = await f.lock();
  const write = secretWriteStarted(f.repository.kind);
  let returned = false;
  const running = f.native.revealKeyWithAuthorization({ id: f.key!.id, authorizationId: authorization.authorizationId }, f.observation).then(value => {
    returned = true;
    return value;
  });
  try {
    await write.started;
    expect(held.state).toBe("claimed");
    expect(returned).toBe(false);
    expect(held.decryptionKey.some(byte => byte !== 0)).toBe(true);
    await expect(f.native.revealKeyWithAuthorization({ id: f.key!.id, authorizationId: authorization.authorizationId }, f.observation)).rejects.toThrow("unavailable");
    await unlock();
    await expect(running).resolves.toMatchObject({ value: "unit-native-owned-value", key: { id: f.key!.id } });
    expect(held.decryptionKey.every(byte => byte === 0)).toBe(true);
    expect(f.heldKeys.authorization(authorization.authorizationId)).toBeUndefined();
    await expect(f.finish()).resolves.toMatchObject({ state: "clear" });
  } finally {
    write.unsubscribe();
    await unlock();
    await running;
  }
});

it.each(["expiry", "revoke", "rotate"] as const)("refuses a secret after %s during real pending SQL without sending a provider request", async mode => {
  let now = 1000;
  const f = await nativeSecretFixture({ now: () => now });
  await f.native.snapshot(f.observation);
  const unlock = await f.lock();
  const write = secretWriteStarted(f.repository.kind);
  const owned = await f.model();
  const running = owned.invoke().then(value => ({ value }), error => ({ error: error as unknown }));
  let rotating: Promise<unknown> | undefined;
  try {
    await write.started;
    if (mode === "expiry") now += 20_000;
    else if (mode === "revoke") f.service.revokeSessionUnlock("session.unit", { userId: "actor.unit", administrator: false });
    else {
      rotating = f.service.rotateKey({ id: f.key!.id, value: "unit-native-next-value", authorizationPassword: "unit-password", actorUserId: "actor.unit", nowMs: 2000 });
      await vi.waitFor(() => expect(f.service.activeRevealAuthorizationCount()).toBe(0));
    }
    await unlock();
    const outcome = await running;
    expect(outcome).toMatchObject({ error: { message: "Secret reveal authorization is unavailable" } });
    expect(f.sends()).toBe(0);
    expect(f.service.activeRevealAuthorizationCount()).toBe(0);
    if (rotating) await rotating;
  } finally {
    write.unsubscribe();
    await unlock();
    await running;
    if (rotating) await rotating;
  }
});

it("retains actual commit-with-unverified-ACK history across reentry and reopened authority", async () => {
  const f = await nativeSecretFixture();
  await f.native.snapshot(f.observation);
  const unlock = await f.lock();
  const write = secretWriteStarted(f.repository.kind);
  const owned = await f.model();
  const running = owned.invoke().then(value => ({ value }), error => ({ error: error as unknown }));
  const original = performance.now;
  let substituted = 0;
  try {
    await write.started;
    await new Promise<void>(resolve => { setTimeout(resolve, 25); });
    vi.spyOn(performance, "now").mockImplementation(() => {
      substituted++;
      return original.call(performance);
    });
    await unlock();
    const outcome = await running;
    vi.restoreAllMocks();
    expect("error" in outcome).toBe(true);
    expect(substituted).toBe(0);
    expect((await f.repository.get(f.key!.id))?.data.lastRevealedAtMs).toBeTypeOf("number");
    expect(f.sends()).toBe(0);
    expect(f.service.activeRevealAuthorizationCount()).toBe(0);
    await expect(f.native.snapshot(f.observation)).rejects.toThrow();
    await f.release();
    await expect(reserveReopenedSecretScope(f.history)).rejects.toThrow();
    expect(f.sends()).toBe(0);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
  } finally {
    vi.restoreAllMocks();
    write.unsubscribe();
    await unlock();
    await running;
  }
});
