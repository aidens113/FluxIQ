// The policy lets any user call `secrets:Unlock`, on their own user; the handler is what keeps it
// to their own keys. This drives the real handler with two real people: what one person's unlock
// can reach of another's, and that a plain user under `service` can still unlock at all.

import { describe, expect, it } from "vitest";

import { IAM_USER_ACCESS } from "../../../../platform/iam/predefined/index.ts";
import { fixedPolicySource } from "../../../_shared/tests/iam-registry-fixtures.ts";
import { createGlobalProgramRuntime } from "../../../index.ts";
import { actorFor } from "../../../tests/login-actor.ts";

type Answer = { ok: boolean; error?: string; payload?: { unlockedKeyCount?: number; stillLocked?: string[] } };

const ALICE_PASSWORD = "dummy-alice-password";
const BOB_PASSWORD = "dummy-bob-password";

async function twoPeople(options?: Parameters<typeof createGlobalProgramRuntime>[1]) {
  const runtime = createGlobalProgramRuntime(undefined, options);
  await runtime.identityAccess.upsertUser({ id: "user.alice", username: "alice", displayName: "Alice", password: ALICE_PASSWORD, roleId: "admin" });
  await runtime.identityAccess.upsertUser({ id: "user.bob", username: "bob", displayName: "Bob", password: BOB_PASSWORD, roleId: "admin" });
  const alice = await runtime.identityAccess.authenticate({ username: "alice", password: ALICE_PASSWORD });
  const bob = await runtime.identityAccess.authenticate({ username: "bob", password: BOB_PASSWORD });
  const aliceKey = await runtime.secretKeys.createKey({ name: "Alice's model key", value: "dummy-alice-value", authorizationPassword: ALICE_PASSWORD, createdBy: alice.user.id });
  const bobKey = await runtime.secretKeys.createKey({ name: "Bob's model key", value: "dummy-bob-value", authorizationPassword: BOB_PASSWORD, createdBy: bob.user.id });
  const asBob = (payload: Record<string, unknown>) => runtime.api.call({ programId: "secret-keys", endpoint: "unlock", scope: {}, actor: actorFor(bob), payload }) as Promise<Answer>;
  return { runtime, alice, bob, aliceKey, bobKey, asBob };
}

describe("one person's unlock, and another person's keys", () => {
  it("a plain user holding only FluxIQUserAccess under service unlocks their own key through the real handler, and no one else's", async () => {
    const { runtime, alice, bob, aliceKey, bobKey, asBob } = await twoPeople({ iam: { profile: "service", source: fixedPolicySource([IAM_USER_ACCESS]) } });
    try {
      expect(await asBob({ authSessionId: bob.session.id, authorizationPassword: BOB_PASSWORD })).toMatchObject({ ok: true, payload: { unlockedKeyCount: 1 } });
      await expect(runtime.secretKeys.createSessionRevealAuthorization({ sessionId: bob.session.id, userId: bob.user.id, id: bobKey.id })).resolves.toBeDefined();
      await expect(runtime.secretKeys.createSessionRevealAuthorization({ sessionId: bob.session.id, userId: bob.user.id, id: aliceKey.id })).rejects.toThrow("unavailable");
      expect(runtime.secretKeys.unlockedSessionFor(alice.user.id)).toBeNull();
      expect(await asBob({ authSessionId: alice.session.id, authorizationPassword: ALICE_PASSWORD })).toMatchObject({ ok: false, error: "Sign in to FluxIQ to unlock your model keys." });
    } finally {
      runtime.secretKeys.close();
    }
  });

  it("opens only the caller's own keys, and leaves the other person's closed", async () => {
    const { runtime, alice, bob, aliceKey, bobKey, asBob } = await twoPeople();
    const answer = await asBob({ authSessionId: bob.session.id, authorizationPassword: BOB_PASSWORD });
    expect(answer).toMatchObject({ ok: true, payload: { unlockedKeyCount: 1 } });
    await expect(runtime.secretKeys.createSessionRevealAuthorization({ sessionId: bob.session.id, userId: bob.user.id, id: bobKey.id })).resolves.toBeDefined();
    await expect(runtime.secretKeys.createSessionRevealAuthorization({ sessionId: bob.session.id, userId: bob.user.id, id: aliceKey.id })).rejects.toThrow("unavailable");
    expect(runtime.secretKeys.unlockedSessionFor(alice.user.id)).toBeNull();
    runtime.secretKeys.close();
  });

  it("will not unlock with another person's session, even holding their password", async () => {
    const { runtime, alice, asBob } = await twoPeople();
    const answer = await asBob({ authSessionId: alice.session.id, authorizationPassword: ALICE_PASSWORD });
    expect(answer).toMatchObject({ ok: false, error: "Sign in to FluxIQ to unlock your model keys." });
    expect(runtime.secretKeys.unlockedSessionFor(alice.user.id)).toBeNull();
    runtime.secretKeys.close();
  });

  it("will not lift another person's browser by naming it, with or without a ticket", async () => {
    const { runtime, alice, bob, asBob } = await twoPeople();
    const holder = { holderKind: "paired-client" as const, holderId: "paired-client:alices", userId: alice.user.id, expiresAtMs: Date.now() + 60_000, label: "Alice's Chrome" };
    await runtime.secretKeys.credentialUnlocks.presentCredential(holder, "dummy-credential-alice", { verified: true });
    runtime.secretKeys.credentialUnlocks.bindVouch(() => true);
    const ticket = runtime.secretKeys.credentialUnlocks.unlockTicketFor(holder.holderId);
    expect(ticket).toBeDefined();
    const answer = await asBob({ authSessionId: bob.session.id, authorizationPassword: BOB_PASSWORD, clientIds: [holder.holderId], ...(ticket === undefined ? {} : { unlockTicket: ticket }) });
    expect(answer.ok, answer.error).toBe(true);
    // Bob is not told about it, and it stays locked for Alice.
    expect(answer.payload?.stillLocked).toEqual([]);
    expect((await runtime.secretKeys.credentialUnlocks.lockedClientsFor(alice.user.id)).map((client) => client.holderId)).toEqual([holder.holderId]);
    expect(await runtime.secretKeys.credentialUnlocks.lockedClientsFor(bob.user.id)).toEqual([]);
    runtime.secretKeys.close();
  });
});
