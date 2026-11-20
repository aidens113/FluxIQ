// @fluxiq-test-group real-sql
// Covers handle-program-request.ts with program-route.ts: a paired client saves, replaces and removes its person's own model
// key through the whole route, with a real pairing token from the real client gateway, against the real registry, IAM and key
// store (t928, t950). Nothing asks for a password, PIN or code; IAM decides (`secrets.manage` on the caller's own user), so a
// member's client is refused as the member's login is, a revoked pairing's token is refused before anything runs, and every
// other key write stays the signed-in person's. Dummy values; no provider calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FluxIQ } from "../../../framework/index.ts";
import type { GlobalProgramRuntime } from "../../../programs/index.ts";
import { RuntimeAccessFixture, type RuntimeClient } from "../../../programs/_shared/tests/runtime-access-fixture.ts";
import { handleProgramRequest, type ProgramRouteRequest } from "../handle-program-request.ts";

const MEMBER_PASSWORD = "member-password-for-tests";
const NOT_AVAILABLE = "This endpoint is not available to a paired client.";

type Answer = { status: number; raw: string; body: { ok: boolean; error?: string; errorCode?: string; payload?: any } };
type Login = Awaited<ReturnType<RuntimeAccessFixture["signIn"]>>;

let fixture: RuntimeAccessFixture;
let runtime: GlobalProgramRuntime;
beforeEach(async () => {
  vi.stubEnv("FLUXIQ_PROFILE", "local");
  vi.stubEnv("FLUXIQ_SECRET_KEYS_KEYRING_FILE", "");
  // No provider is ever asked; a call that tried would be refused here.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
  fixture = await RuntimeAccessFixture.create();
  runtime = fixture.boot();
});
afterEach(async () => {
  try {
    await fixture.dispose();
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

/** One call through the route, by the client's token or the person's panel cookie, never both. */
async function send(endpoint: string, body: unknown, caller: { token: string } | { cookie: string }): Promise<Answer> {
  const request: ProgramRouteRequest = {
    method: "POST",
    url: `http://127.0.0.1/api/programs/secret-keys/${endpoint}`,
    programId: "secret-keys",
    endpoint,
    sessionId: "cookie" in caller ? caller.cookie : undefined,
    authorization: "token" in caller ? `Bearer ${caller.token}` : null,
    readJson: async () => (body === undefined ? undefined : JSON.parse(JSON.stringify(body))),
  };
  const response = await handleProgramRequest(request, { fluxiq: { programs: runtime, activeDomainId: null } as unknown as FluxIQ });
  return { status: response.status, raw: response.body, body: JSON.parse(response.body) };
}

async function member(): Promise<{ login: Login; client: RuntimeClient }> {
  // Every permission a paired client may carry except `secrets.manage`.
  await runtime.identityAccess.upsertRole({ id: "member", permissions: ["programs.read", "programs.write", "runtime.control", "flows.write"] });
  await runtime.identityAccess.upsertUser({ username: "member", displayName: "Member", roleId: "member", password: MEMBER_PASSWORD });
  const login = await fixture.signIn(runtime, "member", MEMBER_PASSWORD);
  return { login, client: await fixture.pair(runtime, login) };
}

describe("a paired client and its person's own model key, through the program route", () => {
  it("lets an administrator's paired client save, replace and remove it with no password, PIN or code, and never hands it the key's id", async () => {
    const admin = await fixture.signIn(runtime);
    const client = await fixture.pair(runtime, admin);
    const credentialChecks = vi.spyOn(runtime.identityAccess, "authorizeSessionCredentials");
    // Whatever the sign-in itself holds; the token's writes must add nothing to it.
    const heldBefore = runtime.secretKeys.activeSessionUnlockCount();
    const token = { token: client.token };

    // An older client's credential fields ask for nothing and are not handed on.
    const saved = await send("save-model-key", { provider: "anthropic", value: "dummy-saved-value", name: "Mine", authorizationPassword: "wrong", authorizationPin: "0000", authSessionId: "spoofed" }, token);
    expect(saved.status, saved.body.error).toBe(200);
    expect(saved.body.payload.modelAccess.key).toMatchObject({ name: "Mine", provider: "anthropic" });
    const [stored] = (await runtime.secretKeys.snapshot()).keys;
    expect(stored).toMatchObject({ name: "Mine", createdBy: admin.user.id });
    const keyId = stored?.id ?? "";
    expect(keyId).not.toBe("");

    const replaced = await send("replace-model-key", { value: "dummy-replaced-value" }, token);
    expect(replaced.status, replaced.body.error).toBe(200);
    expect(replaced.body.payload.modelAccess.key).toMatchObject({ provider: "anthropic" });
    expect((await runtime.secretKeys.snapshot()).keys.map((key) => key.id)).toEqual([keyId]);

    const removed = await send("remove-model-key", {}, token);
    expect(removed.status, removed.body.error).toBe(200);
    expect(removed.body.payload).toEqual({ modelAccess: expect.objectContaining({ status: "no_key", key: null }) });
    expect((await runtime.secretKeys.snapshot()).keys).toEqual([]);

    for (const answer of [saved, replaced, removed]) {
      expect(Object.keys(answer.body.payload)).toEqual(["modelAccess"]);
      expect(answer.raw).not.toContain(keyId);
      expect(answer.raw).not.toMatch(/dummy-(saved|replaced)-value/u);
    }
    expect(credentialChecks).not.toHaveBeenCalled();
    expect(runtime.secretKeys.activeSessionUnlockCount()).toBe(heldBefore);
  });

  it("refuses a member's paired client, whose role does not hold secrets.manage, and writes nothing", async () => {
    const admin = await fixture.signIn(runtime);
    await fixture.createKey(runtime, admin);
    const { client } = await member();
    const before = (await runtime.secretKeys.snapshot()).keys;
    for (const [endpoint, payload] of [["save-model-key", { provider: "anthropic", value: "dummy-member-value" }], ["replace-model-key", { value: "dummy-member-value" }], ["remove-model-key", {}]] as const) {
      const answer = await send(endpoint, payload, { token: client.token });
      expect(answer.status, endpoint).toBe(403);
      expect(answer.body.ok, endpoint).toBe(false);
      expect(answer.raw, endpoint).not.toContain("dummy-member-value");
    }
    expect((await runtime.secretKeys.snapshot()).keys).toEqual(before);
  });

  it("refuses a revoked pairing's token before any handler runs, and writes nothing", async () => {
    const admin = await fixture.signIn(runtime);
    const client = await fixture.pair(runtime, admin);
    const token = { token: client.token };
    expect((await send("save-model-key", { provider: "anthropic", value: "dummy-before-value" }, token)).status).toBe(200);
    const before = (await runtime.secretKeys.snapshot()).keys;
    const { trustedClientId } = await fixture.principal(runtime, client, admin.user.id);
    expect(await runtime.clientGateway.revokeTrustedClient(trustedClientId)).toBe(true);

    const call = vi.spyOn(runtime.api, "call");
    for (const [endpoint, payload] of [["save-model-key", { provider: "anthropic", value: "dummy-revoked-value" }], ["replace-model-key", { value: "dummy-revoked-value" }], ["remove-model-key", {}], ["snapshot", {}]] as const) {
      const answer = await send(endpoint, payload, token);
      expect(answer.status, endpoint).toBe(401);
      expect(answer.body.ok, endpoint).toBe(false);
      expect(answer.raw, endpoint).not.toContain("dummy-revoked-value");
    }
    expect(call).not.toHaveBeenCalled();
    expect((await runtime.secretKeys.snapshot()).keys).toEqual(before);
  });

  it("hands the token's actor secrets.manage on the three model-key writes alone, never on another call it may make (t955)", async () => {
    const admin = await fixture.signIn(runtime);
    expect(admin.role.permissions).toContain("secrets.manage");
    const client = await fixture.pair(runtime, admin);
    const call = vi.spyOn(runtime.api, "call");
    const token = { token: client.token };
    const permissionsOf = (endpoint: string) => call.mock.calls.filter(([request]) => request.endpoint === endpoint).map(([request]) => request.actor?.permissions);

    expect((await send("snapshot", {}, token)).status).toBe(200);
    expect((await send("save-model-key", { provider: "anthropic", value: "dummy-actor-value" }, token)).status).toBe(200);
    expect((await send("replace-model-key", { value: "dummy-actor-value-2" }, token)).status).toBe(200);
    expect((await send("remove-model-key", {}, token)).status).toBe(200);

    // The snapshot is on the same program and the same token, and still never carries it.
    const [snapshot] = permissionsOf("snapshot");
    expect(snapshot).toBeDefined();
    expect(snapshot).not.toContain("secrets.manage");
    for (const endpoint of ["save-model-key", "replace-model-key", "remove-model-key"]) {
      const seen = permissionsOf(endpoint);
      expect(seen.length, endpoint).toBe(1);
      expect([...(seen[0] ?? [])].sort(), endpoint).toEqual([...(snapshot ?? []), "secrets.manage"].sort());
      expect(seen[0], endpoint).not.toContain("identity.manage");
    }
  });

  it("still refuses every other key write to a paired client before its handler runs, the default key, offering and revealing a key included", async () => {
    const admin = await fixture.signIn(runtime);
    const key = await fixture.createKey(runtime, admin);
    const client = await fixture.pair(runtime, admin);
    const call = vi.spyOn(runtime.api, "call");
    const refused = [
      ["set-default-key", { id: key.id }],
      ["offer-key", { id: key.id, offered: true }],
      ["reveal-key", { id: key.id, authorizationPassword: "admin" }],
      ["create-key", { name: "Other", kind: "llm", provider: "Anthropic", value: "dummy-other-value" }],
      ["rotate-key", { id: key.id, value: "dummy-other-value" }],
      ["delete-key", { id: key.id }],
      ["set-assistant-model", { keyId: key.id }],
    ] as const;
    for (const [endpoint, payload] of refused) {
      const answer = await send(endpoint, payload, { token: client.token });
      expect(answer.status, endpoint).toBe(403);
      expect(answer.body.error, endpoint).toBe(NOT_AVAILABLE);
    }
    expect(call).not.toHaveBeenCalled();
    expect((await runtime.secretKeys.snapshot()).keys.map((stored) => stored.id)).toEqual([key.id]);
  });

  it("lets another administrator's token save only their own key: the workspace's key and model stay, and a member keeps chatting on the lent key", async () => {
    // Admin A saves the workspace's first key from the panel, chooses its model and offers it to the workspace.
    const adminA = await fixture.signIn(runtime);
    expect((await send("save-model-key", { provider: "anthropic", value: "dummy-team-value", name: "Team" }, { cookie: adminA.session.id })).status).toBe(200);
    const [team] = (await runtime.secretKeys.snapshot()).keys;
    expect(team).toMatchObject({ name: "Team", createdBy: adminA.user.id });
    await runtime.secretKeys.modelKeys.setAssistant({ keyId: team!.id, model: "claude-haiku-5-5", chosenBy: adminA.user.id });
    await runtime.secretKeys.modelKeys.setOffered(team!.id, true, adminA.user.id);
    const workspaceBefore = await runtime.secretKeys.modelKeys.read();
    const { login: memberLogin } = await member();
    const memberAccess = async () => (await send("snapshot", {}, { cookie: memberLogin.session.id })).body.payload?.modelAccess;
    expect(await memberAccess()).toMatchObject({ status: "ready", key: { id: team!.id } });

    // Admin B, another administrator, saves a key of their own through their paired client's token.
    await runtime.identityAccess.upsertUser({ username: "second-admin", displayName: "Second admin", roleId: adminA.role.id, password: "second-admin-password" });
    const adminB = await fixture.signIn(runtime, "second-admin", "second-admin-password");
    const clientB = await fixture.pair(runtime, adminB);
    const saved = await send("save-model-key", { provider: "deepseek", value: "dummy-second-admin-value", name: "Second admin's" }, { token: clientB.token });
    expect(saved.status, saved.body.error).toBe(200);
    expect(saved.body.payload.modelAccess).toMatchObject({ status: "ready", key: { name: "Second admin's", provider: "deepseek" } });

    expect(await runtime.secretKeys.modelKeys.read()).toEqual(workspaceBefore);
    expect(await runtime.secretKeys.modelKeys.resolveAssistant()).toMatchObject({ ok: true, keyId: team!.id, model: "claude-haiku-5-5", chosenForWorkspace: true, offeredByHolder: true });
    expect(await memberAccess()).toMatchObject({ status: "ready", key: { id: team!.id } });
    expect((await send("snapshot", {}, { cookie: adminA.session.id })).body.payload.modelAccess).toMatchObject({ status: "ready", key: { id: team!.id } });

    // Admin B removes their own key through the token: still nobody else's choice moves.
    expect((await send("remove-model-key", {}, { token: clientB.token })).status).toBe(200);
    expect(await runtime.secretKeys.modelKeys.read()).toEqual(workspaceBefore);
    expect(await memberAccess()).toMatchObject({ status: "ready", key: { id: team!.id } });
  });

  it("leaves the panel's own route as it was: the signed-in person saves and removes with the key's id in the answer", async () => {
    const admin = await fixture.signIn(runtime);
    const cookie = { cookie: admin.session.id };
    const saved = await send("save-model-key", { provider: "deepseek", value: "dummy-panel-value" }, cookie);
    expect(saved.status, saved.body.error).toBe(200);
    const [stored] = (await runtime.secretKeys.snapshot()).keys;
    expect(saved.body.payload.modelAccess.key).toMatchObject({ id: stored?.id, provider: "deepseek" });
    // A key write a paired client may never reach still answers the panel.
    const renamed = await send("update-key", { id: stored?.id, name: "Renamed" }, cookie);
    expect(renamed.status, renamed.body.error).toBe(200);
    expect(renamed.body.payload).toMatchObject({ id: stored?.id, name: "Renamed" });
    const removed = await send("remove-model-key", {}, cookie);
    expect(removed.status, removed.body.error).toBe(200);
    expect(removed.body.payload.modelAccess.status).toBe("no_key");
  });
});
