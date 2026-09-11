// The secret keys program and the TOTP it demands before revealing a key.

import { describe, expect, it } from "vitest";

import { createGlobalProgramRuntime } from "../index.ts";
import { actorFor } from "./login-actor.ts";
import { testTotpCode } from "./totp-code.ts";

describe("global program services", () => {
  it("creates secret keys without requiring TOTP but requires TOTP to reveal them", async () => {
    const runtime = createGlobalProgramRuntime();
    const setup = await runtime.identityAccess.beginTotp("admin");
    const code = testTotpCode(setup.secret);
    await runtime.identityAccess.confirmTotp("admin", code);
    const login = await runtime.identityAccess.authenticate({ username: "admin", password: "admin", totp: code });

    const created = await runtime.api.call({
      programId: "secret-keys",
      endpoint: "create-key",
      scope: {},
      actor: actorFor(login),
      payload: { name: "DeepSeek", value: "sk-secret", provider: "DeepSeek", authSessionId: login.session.id, authorizationPassword: "admin" }
    }) as { ok: boolean; payload?: { id: string }; error?: string };

    expect(created.ok, created.error).toBe(true);
    await expect(runtime.api.call({
      programId: "secret-keys",
      endpoint: "reveal-key",
      scope: {},
      actor: actorFor(login),
      payload: { id: created.payload?.id, authSessionId: login.session.id, authorizationPassword: "admin" }
    })).resolves.toMatchObject({ ok: false, requiresRecheck: true });
    await expect(runtime.api.call({
      programId: "secret-keys",
      endpoint: "reveal-key",
      scope: {},
      actor: actorFor(login),
      payload: { id: created.payload?.id, authSessionId: login.session.id, authorizationPassword: "admin", authorizationTotp: code }
    })).resolves.toMatchObject({ ok: true, payload: { value: "sk-secret" } });
  });
});
