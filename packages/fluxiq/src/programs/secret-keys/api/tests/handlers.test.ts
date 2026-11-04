// The Secret Keys endpoints hand the signed-in person's verified session to the
// service, so a key added on Secret Keys is usable by that sign-in at once
// (install proof C5: the chat said "your model key is locked" until a re-login).

import { describe, expect, it, vi } from "vitest";

import { createGlobalProgramRuntime } from "../../../index.ts";
import { actorFor } from "../../../tests/login-actor.ts";

type Created = { ok: boolean; payload?: { id: string }; error?: string };

async function signIn(runtime: ReturnType<typeof createGlobalProgramRuntime>) {
  const login = await runtime.identityAccess.authenticate({ username: "admin", password: "admin" });
  // What the login route does after authenticating.
  await runtime.secretKeys.unlockSession({ sessionId: login.session.id, userId: login.user.id, authorizationPassword: "admin", expiresAtMs: login.session.expiresAtMs });
  return login;
}

describe("secret-keys endpoints", () => {
  it("makes a created key usable in the creator's current sign-in without a re-login", async () => {
    const runtime = createGlobalProgramRuntime();
    const login = await signIn(runtime);
    expect(runtime.secretKeys.unlockedSessionFor(login.user.id)).toBeNull();

    const created = await runtime.api.call({
      programId: "secret-keys",
      endpoint: "create-key",
      scope: {},
      actor: actorFor(login),
      payload: { name: "DeepSeek", value: "sk-dummy", provider: "deepseek", authSessionId: login.session.id, authorizationPassword: "admin" }
    }) as Created;

    expect(created.ok, created.error).toBe(true);
    const id = created.payload?.id ?? "";
    expect(runtime.secretKeys.unlockedSessionFor(login.user.id)).toBe(login.session.id);
    const authorization = await runtime.secretKeys.createSessionRevealAuthorization({ sessionId: login.session.id, userId: login.user.id, id });
    await expect(runtime.secretKeys.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id })).resolves.toMatchObject({ value: "sk-dummy" });
    runtime.secretKeys.close();
  });

  describe("unlock, which asks what sign-in asks", () => {
    async function withPinAndKey() {
      const runtime = createGlobalProgramRuntime();
      const login = await signIn(runtime);
      await runtime.identityAccess.setPin(login.user.id, "4321");
      await runtime.secretKeys.createKey({ name: "Model", value: "dummy-value", authorizationPassword: "admin", createdBy: login.user.id });
      const call = (payload: Record<string, unknown>) => runtime.api.call({ programId: "secret-keys", endpoint: "unlock", scope: {}, actor: actorFor(login), payload: { authSessionId: login.session.id, ...payload } }) as Promise<Created>;
      return { runtime, login, call };
    }

    it("takes the password alone, with a PIN set: a PIN is for dangerous acts", async () => {
      const { runtime, call } = await withPinAndKey();
      const answer = await call({ authorizationPassword: "admin", clientIds: [] });
      expect(answer.ok, answer.error).toBe(true);
      runtime.secretKeys.close();
    });

    it("refuses a wrong password, and asks to recheck", async () => {
      const { runtime, call } = await withPinAndKey();
      await expect(call({ authorizationPassword: "dummy-wrong" })).resolves.toMatchObject({ ok: false, requiresRecheck: true });
      runtime.secretKeys.close();
    });

    it("lifts a browser nobody has unlocked only with what that browser alone can read", async () => {
      const { runtime, login, call } = await withPinAndKey();
      const holder = { holderKind: "paired-client" as const, holderId: "paired-client:one", userId: login.user.id, expiresAtMs: Date.now() + 60_000, label: "Chrome" };
      await runtime.secretKeys.credentialUnlocks.presentCredential(holder, "dummy-credential-one", { verified: true });
      const proved = vi.spyOn(runtime.secretKeys.credentialUnlocks, "personProved");
      const lifted = () => [...(proved.mock.calls.at(-1)?.[2]?.lift ?? [])];
      await call({ authorizationPassword: "admin", clientIds: ["paired-client:one", 7, null] });
      expect(lifted()).toEqual([]);
      const unlockTicket = runtime.secretKeys.credentialUnlocks.unlockTicketFor(holder.holderId);
      await call({ authorizationPassword: "admin", clientIds: ["paired-client:one"], unlockTicket: "paired-client:one.dummy" });
      expect(lifted()).toEqual([]);
      expect(unlockTicket?.startsWith(holder.holderId)).toBe(true);
      await call({ authorizationPassword: "admin", clientIds: ["paired-client:one"], unlockTicket });
      expect(lifted()).toEqual(["paired-client:one"]);
      runtime.secretKeys.close();
    });

    it("a ticket is not given to a panel, and not for a browser unlocked before", async () => {
      const { runtime, login } = await withPinAndKey();
      const holder = { holderKind: "paired-client" as const, holderId: "paired-client:one", userId: login.user.id, expiresAtMs: Date.now() + 60_000, label: "Chrome" };
      await runtime.secretKeys.credentialUnlocks.presentCredential(holder, "dummy-credential-one", { verified: true });
      runtime.secretKeys.credentialUnlocks.bindVouch(() => true);
      expect((await runtime.secretKeys.snapshotFor({ userId: login.user.id, sessionId: login.session.id }) as { unlockTicket?: string }).unlockTicket).toBeUndefined();
      expect((await runtime.secretKeys.snapshotFor({ userId: login.user.id, sessionId: null, holderId: holder.holderId }) as { unlockTicket?: string }).unlockTicket).toBeDefined();
      await runtime.secretKeys.credentialUnlocks.lock(holder.holderId, "signed_out");
      expect(runtime.secretKeys.credentialUnlocks.unlockTicketFor(holder.holderId)).toBeUndefined();
      runtime.secretKeys.close();
    });

    it("names none unless asked", async () => {
      const { runtime, call } = await withPinAndKey();
      const proved = vi.spyOn(runtime.secretKeys.credentialUnlocks, "personProved");
      await call({ authorizationPassword: "admin" });
      expect([...(proved.mock.calls.at(-1)?.[2]?.lift ?? [])]).toEqual([]);
      runtime.secretKeys.close();
    });
  });

  it("holds the key in no session when the verified session is not the caller's", async () => {
    const runtime = createGlobalProgramRuntime();
    const first = await signIn(runtime);
    const second = await signIn(runtime);

    const created = await runtime.api.call({
      programId: "secret-keys",
      endpoint: "create-key",
      scope: {},
      actor: actorFor(first),
      payload: { name: "DeepSeek", value: "sk-dummy", provider: "deepseek", authSessionId: second.session.id, authorizationPassword: "admin" }
    }) as Created;

    expect(created.ok, created.error).toBe(true);
    expect(runtime.secretKeys.unlockedSessionFor(first.user.id)).toBeNull();
    runtime.secretKeys.close();
  });
});
