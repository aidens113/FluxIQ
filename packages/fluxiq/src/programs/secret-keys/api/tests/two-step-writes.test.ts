// A person with two-step sign-in (TOTP) turned on passed it once, at sign-in.
// From then on their signed-in panel session, and a paired client of theirs,
// save, edit, replace and remove their own keys on every write endpoint with
// no authenticator code, password or PIN: IAM alone decides (t928). Only
// reveal-key, which shows a value to a person, still checks their password.
// Real program runtime, in memory; dummy values only; no provider calls.
//
// The paired client's actor is what `server/program-route` builds for one,
// with `secrets.manage` kept: the route's PAIRED_CLIENT_PERMISSIONS must keep
// it for a client to reach these writes at all (key-writes report, Round 2).

import { describe, expect, it, vi } from "vitest";
import { createGlobalProgramRuntime } from "../../../index.ts";
import { PAIRED_PERMISSIONS } from "../../../_shared/tests/iam-registry-fixtures.ts";
import type { ProgramApiActor, ProgramApiResponse } from "../../../_shared/api.ts";
import { actorFor } from "../../../tests/login-actor.ts";
import { testTotpCode } from "../../../tests/totp-code.ts";

const PASSWORD = "admin";

async function twoStepWorkspace() {
  const runtime = createGlobalProgramRuntime(undefined, { modelProvidersEnabled: false });
  const setup = await runtime.identityAccess.beginTotp("admin");
  await runtime.identityAccess.confirmTotp("admin", testTotpCode(setup.secret));
  await expect(runtime.identityAccess.authenticate({ username: "admin", password: PASSWORD })).rejects.toThrow();
  const login = await runtime.identityAccess.authenticate({ username: "admin", password: PASSWORD, totp: testTotpCode(setup.secret) });
  const panel = actorFor(login);
  const client: ProgramApiActor = {
    userId: login.user.id, sessionId: "client-gateway:two-step-browser", roleId: login.role.id, channel: "paired-client",
    permissions: login.role.permissions.filter((permission) => [...PAIRED_PERMISSIONS, "secrets.manage"].includes(permission))
  };
  const credentialChecks = vi.spyOn(runtime.identityAccess, "authorizeSessionCredentials");
  const call = (endpoint: string, actor: ProgramApiActor, payload: Record<string, unknown> = {}) =>
    runtime.api.call({ programId: "secret-keys", endpoint, scope: {}, actor, payload }) as Promise<ProgramApiResponse<any>>;
  return { runtime, login, panel, client, call, credentialChecks };
}

describe("a person who passed two-step at sign-in", () => {
  it.each(["panel", "client"] as const)("writes their own keys from a %s with no authenticator code, password or PIN", async (via) => {
    const f = await twoStepWorkspace();
    try {
      const actor = via === "panel" ? f.panel : f.client;
      const created = await f.call("create-key", actor, { name: "Model", kind: "llm", provider: "Anthropic", value: "dummy-created-value" });
      expect(created.ok, created.error).toBe(true);
      const id = created.payload.id as string;
      for (const [endpoint, payload] of [["update-key", { id, name: "Renamed" }], ["rotate-key", { id, value: "dummy-rotated-value" }], ["delete-key", { id }]] as const) {
        const answer = await f.call(endpoint, actor, payload);
        expect(answer.ok, `${endpoint}: ${answer.error}`).toBe(true);
      }
      expect(await f.runtime.secretKeys.getKeySummary(id)).toBeNull();

      const saved = await f.call("save-model-key", actor, { provider: "anthropic", value: "dummy-saved-value" });
      expect(saved.ok, saved.error).toBe(true);
      expect(saved.payload.modelAccess.key).toMatchObject({ provider: "anthropic" });
      expect(Boolean(saved.payload.modelAccess.key.id)).toBe(via === "panel");
      const replaced = await f.call("replace-model-key", actor, { value: "dummy-replaced-value" });
      expect(replaced.ok, replaced.error).toBe(true);
      const removed = await f.call("remove-model-key", actor);
      expect(removed.ok, removed.error).toBe(true);
      expect(removed.payload.modelAccess.status).toBe("no_key");

      // Nothing asked for a second factor, and nothing was held for a session.
      expect(f.credentialChecks).not.toHaveBeenCalled();
      expect(f.runtime.secretKeys.activeSessionUnlockCount()).toBe(0);
      expect(JSON.stringify([created, saved, replaced, removed])).not.toMatch(/dummy-(created|saved|replaced)-value/);
    } finally {
      f.runtime.secretKeys.close();
    }
  });

  it("is still refused a write IAM does not allow, code or no code", async () => {
    const f = await twoStepWorkspace();
    try {
      const narrow: ProgramApiActor = { ...f.client, permissions: [...PAIRED_PERMISSIONS] };
      for (const [endpoint, payload] of [["create-key", { name: "Model", value: "dummy-value" }], ["save-model-key", { provider: "anthropic", value: "dummy-value" }], ["remove-model-key", {}]] as const) {
        expect((await f.call(endpoint, narrow, payload)).ok, endpoint).toBe(false);
      }
      expect((await f.runtime.secretKeys.snapshot()).keys).toEqual([]);
    } finally {
      f.runtime.secretKeys.close();
    }
  });
});
