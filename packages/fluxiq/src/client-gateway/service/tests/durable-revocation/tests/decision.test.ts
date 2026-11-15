import { describe, expect, it } from "vitest";
import { revocationFixture } from "../fixture.ts";

describe("durable gateway teardown decisions", () => {
  it.each(["operator", "credential"] as const)("waits for a pending %s revoke to roll back before retrying", async (kind) => {
    const { gateway, store, trustedClientId, token } = await revocationFixture();
    const held = store.blockNextSave();
    const first = gateway.revokeTrustedClient(trustedClientId);
    const firstResult = first.then(() => "saved", () => "failed");
    await held.entered;
    let secondDone = false;
    const second = (kind === "operator"
      ? gateway.revokeTrustedClient(trustedClientId)
      : gateway.access.forgetByCredential(token)).then((answer) => {
      secondDone = true;
      return answer;
    });
    // Drain queued continuations without releasing the explicit persistence barrier.
    await new Promise<void>((resolve) => setImmediate(resolve));
    const finishedBeforePersistence = secondDone;
    held.fail();
    expect(await firstResult).toBe("failed");
    const answer = await second;
    await gateway.close();
    expect(finishedBeforePersistence).toBe(false);
    expect(answer).toBe(true);
    expect(store.clients[0]?.revokedAt).toBeDefined();
  });

  it.each(["operator", "credential"] as const)("propagates a failed %s retry after the first save also failed", async (kind) => {
    const { gateway, store, trustedClientId, token } = await revocationFixture();
    const original = structuredClone(store.clients);
    const held = store.blockNextSave();
    const first = gateway.revokeTrustedClient(trustedClientId);
    const firstResult = first.then(() => "saved", () => "failed");
    await held.entered;
    const second = kind === "operator" ? gateway.revokeTrustedClient(trustedClientId) : gateway.access.forgetByCredential(token);
    const secondResult = second.then(() => "saved", () => "failed");
    store.failNext = true;
    held.fail();
    expect(await firstResult).toBe("failed");
    expect(await secondResult).toBe("failed");
    expect(store.clients).toEqual(original);
    await expect(gateway.authorizeToken(token)).resolves.toMatchObject({ trustedClientId });
    await expect(gateway.revokeTrustedClient(trustedClientId)).resolves.toBe(true);
  });

  it.each(["operator", "credential"] as const)("decides repeated %s revocation only after the first save commits", async (kind) => {
    const { gateway, store, trustedClientId, token } = await revocationFixture();
    const held = store.blockNextSave();
    const first = gateway.revokeTrustedClient(trustedClientId);
    await held.entered;
    let completed = false;
    const second = (kind === "operator" ? gateway.revokeTrustedClient(trustedClientId) : gateway.access.forgetByCredential(token)).then((result) => {
      completed = true;
      return result;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const prematurelyCompleted = completed;
    held.succeed();
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(prematurelyCompleted).toBe(false);
    expect(store.clients[0]?.revokedAt).toBeDefined();
    expect(store.saves).toBe(2);
  });

  it("keeps an unrelated client's rollback separate from the queued revoke", async () => {
    const { gateway, store, pair, trustedClientId } = await revocationFixture();
    const other = await pair("extension.other");
    const held = store.blockNextSave();
    const first = gateway.revokeTrustedClient(trustedClientId);
    const firstResult = first.then(() => "saved", () => "failed");
    await held.entered;
    const second = gateway.revokeTrustedClient(other.trustedClientId);
    held.fail();
    expect(await firstResult).toBe("failed");
    expect(await second).toBe(true);
    expect(store.clients.find((client) => client.trustedClientId === trustedClientId)?.revokedAt).toBeUndefined();
    expect(store.clients.find((client) => client.trustedClientId === other.trustedClientId)?.revokedAt).toBeDefined();
  });

  it("recognizes a durable revocation recorded at timestamp zero", async () => {
    const { gateway, store, trustedClientId } = await revocationFixture({ now: 0 });
    await expect(gateway.revokeTrustedClient(trustedClientId, "original")).resolves.toBe(true);
    await expect(gateway.revokeTrustedClient(trustedClientId, "repeat")).resolves.toBe(false);
    expect(store.clients[0]?.revokedAt).toBe(0);
    expect(store.clients[0]?.revocationReason).toBe("original");
    expect(store.saves).toBe(2);
  });

  it("returns false for an unknown ID without a save", async () => {
    const { gateway, store } = await revocationFixture();
    await expect(gateway.revokeTrustedClient("unknown-client")).resolves.toBe(false);
    expect(store.saves).toBe(1);
  });
});
