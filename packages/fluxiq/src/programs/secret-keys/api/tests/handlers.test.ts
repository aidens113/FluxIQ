// The Secret Keys endpoints on the real program runtime: a key added on Secret
// Keys is usable by the person's calls at once, with no password, PIN or
// re-login (install proof C5 once said "your model key is locked" until a
// re-login), and showing a value still takes the person's password, never a PIN.

import { describe, expect, it } from "vitest";

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
  it("makes a created key usable by the creator's calls at once, with no password, PIN or re-login", async () => {
    const runtime = createGlobalProgramRuntime();
    try {
      const login = await signIn(runtime);
      const created = await runtime.api.call({
        programId: "secret-keys",
        endpoint: "create-key",
        scope: {},
        actor: actorFor(login),
        payload: { name: "DeepSeek", value: "sk-dummy", provider: "deepseek" }
      }) as Created;

      expect(created.ok, created.error).toBe(true);
      const id = created.payload?.id ?? "";
      expect(JSON.stringify(created)).not.toContain("sk-dummy");
      // No session holds it: the server opens it for its owner.
      expect(runtime.secretKeys.unlockedSessionFor(login.user.id)).toBeNull();
      const authorization = await runtime.secretKeys.access.createUseAuthorization({ id, principal: { kind: "session", userId: login.user.id, sessionId: login.session.id } });
      await expect(runtime.secretKeys.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id })).resolves.toMatchObject({ value: "sk-dummy" });
    } finally { runtime.secretKeys.close(); }
  });

  describe('the retired unlock ceremony', () => {
    it('registers no unlock endpoint and emits no ticket or locked-client setup', async () => {
      const runtime = createGlobalProgramRuntime();
      try {
        const login = await signIn(runtime);
        const answer = await runtime.api.call({ programId: 'secret-keys', endpoint: 'unlock', scope: {}, actor: actorFor(login), payload: { authSessionId: login.session.id, authorizationPassword: 'admin' } });
        expect(answer).toMatchObject({ ok: false });
        const snapshot = await runtime.secretKeys.snapshotFor({ userId: login.user.id, sessionId: login.session.id });
        expect(snapshot).not.toHaveProperty('unlockTicket');
        expect(snapshot).not.toHaveProperty('lockedClients');
      } finally { runtime.secretKeys.close(); }
    });
  });

  it("shows a value only for the caller's own session and password, never asking for a PIN", async () => {
    const runtime = createGlobalProgramRuntime();
    try {
      const first = await signIn(runtime);
      const second = await signIn(runtime);
      const call = (endpoint: string, payload: Record<string, unknown>) => runtime.api.call({ programId: "secret-keys", endpoint, scope: {}, actor: actorFor(first), payload });
      const created = await call("create-key", { name: "DeepSeek", value: "sk-dummy", provider: "deepseek" }) as Created;
      const id = created.payload?.id ?? "";

      expect(await call("reveal-key", { id })).toMatchObject({ ok: false, requiresRecheck: true });
      expect(await call("reveal-key", { id, authSessionId: second.session.id, authorizationPassword: "admin" })).toMatchObject({ ok: false, requiresRecheck: true });
      expect(await call("reveal-key", { id, authSessionId: first.session.id, authorizationPassword: "wrong" })).toMatchObject({ ok: false });
      expect(await call("reveal-key", { id, authSessionId: first.session.id, authorizationPassword: "admin" })).toMatchObject({ ok: true, payload: { value: "sk-dummy" } });
    } finally { runtime.secretKeys.close(); }
  });
});
