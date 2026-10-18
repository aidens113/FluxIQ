// The Secret Keys endpoints hand the signed-in person's verified session to the
// service, so a key added on Secret Keys is usable by that sign-in at once
// (install proof C5: the chat said "your model key is locked" until a re-login).

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
