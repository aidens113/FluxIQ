// The secret keys program and the TOTP it demands before revealing a key.

import { describe, expect, it } from "vitest";

import { createGlobalProgramRuntime } from "../index.ts";
import { actorFor } from "./login-actor.ts";
import { testTotpCode } from "./totp-code.ts";

describe("global program services", () => {
  it("creates secret keys without requiring TOTP but requires TOTP to reveal them", async () => {
    const runtime = createGlobalProgramRuntime(undefined, { modelProvidersEnabled: false });
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
    // Since t928 a saved key is host-sealed (version 3): AES-256-GCM under a random data key held only as the
    // record's host protection, with no password, KDF or acting-user hint in the seal.
    const store = (runtime.secretKeys as unknown as { store: { get(id: string): { sealed: Record<string, unknown>; hostProtection?: unknown } | undefined } }).store;
    const stored = store.get(created.payload?.id ?? "");
    expect(stored?.sealed).toMatchObject({ version: 3, algorithm: "aes-256-gcm" });
    for (const field of ["iv", "tag", "ciphertext"]) expect(typeof stored?.sealed[field]).toBe("string");
    for (const field of ["kdf", "kdfParams", "salt", "sealedByUserId"]) expect(stored?.sealed).not.toHaveProperty(field);
    expect(stored?.sealed.ciphertext).not.toContain("sk-secret");
    expect(stored?.hostProtection).toBeDefined();
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
