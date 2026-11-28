// @fluxiq-test-group real-sql
// Covers handle-program-request.ts with program-route.ts: a paired client writes no model key through the whole route, its
// person's own included (t1095; it could from t928 to t1095), with a real pairing token from the real client gateway, against
// the real registry, IAM and key store. Every key write by token is refused before any handler runs; the client still reads
// whether its person's key opens, a revoked pairing's token is refused, and the signed-in person's panel writes as before.
// Dummy values; no provider calls.
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

// t1095: keys, settings and project management are the panel's for every client (user, 2026-11-27). From t928 to
// t1095 a paired client could save, replace and remove its person's own model key here; now every key write by token
// is refused before any handler runs, and the client opens the panel for it. It still reads whether a key opens.
describe("a paired client and its person's own model key, through the program route", () => {
  it("refuses an administrator's paired client every model-key write before its handler runs, and writes nothing", async () => {
    const admin = await fixture.signIn(runtime);
    const client = await fixture.pair(runtime, admin);
    const call = vi.spyOn(runtime.api, "call");
    for (const [endpoint, payload] of [["save-model-key", { provider: "anthropic", value: "dummy-token-value", name: "Mine" }], ["replace-model-key", { value: "dummy-token-value" }], ["remove-model-key", {}]] as const) {
      const answer = await send(endpoint, payload, { token: client.token });
      expect(answer.status, endpoint).toBe(403);
      expect(answer.body.error, endpoint).toBe(NOT_AVAILABLE);
      expect(answer.raw, endpoint).not.toContain("dummy-token-value");
    }
    expect(call).not.toHaveBeenCalled();
    expect((await runtime.secretKeys.snapshot()).keys).toEqual([]);
  });

  it("refuses a member's paired client the same way, and leaves a key saved in the panel as it was", async () => {
    const admin = await fixture.signIn(runtime);
    await fixture.createKey(runtime, admin);
    const { client } = await member();
    const before = (await runtime.secretKeys.snapshot()).keys;
    for (const [endpoint, payload] of [["save-model-key", { provider: "anthropic", value: "dummy-member-value" }], ["replace-model-key", { value: "dummy-member-value" }], ["remove-model-key", {}]] as const) {
      const answer = await send(endpoint, payload, { token: client.token });
      expect(answer.status, endpoint).toBe(403);
      expect(answer.body.error, endpoint).toBe(NOT_AVAILABLE);
    }
    expect((await runtime.secretKeys.snapshot()).keys).toEqual(before);
  });

  it("still lets a paired client read whether its person's key opens, with no key id and without secrets.manage", async () => {
    const admin = await fixture.signIn(runtime);
    expect((await send("save-model-key", { provider: "anthropic", value: "dummy-panel-value", name: "Panel" }, { cookie: admin.session.id })).status).toBe(200);
    const [stored] = (await runtime.secretKeys.snapshot()).keys;
    const client = await fixture.pair(runtime, admin);
    const call = vi.spyOn(runtime.api, "call");
    const snapshot = await send("snapshot", {}, { token: client.token });
    expect(snapshot.status, snapshot.body.error).toBe(200);
    expect(snapshot.body.payload.keys).toEqual([expect.objectContaining({ kind: "llm", enabled: true, availability: { state: "available" } })]);
    expect(snapshot.raw).not.toContain(stored?.id ?? "no-id");
    expect(snapshot.raw).not.toContain("dummy-panel-value");
    const permissions = call.mock.calls.find(([request]) => request.endpoint === "snapshot")?.[0].actor?.permissions;
    expect(permissions).toBeDefined();
    expect(permissions).not.toContain("secrets.manage");
  });

  it("refuses a revoked pairing's token before any handler runs", async () => {
    const admin = await fixture.signIn(runtime);
    const client = await fixture.pair(runtime, admin);
    const { trustedClientId } = await fixture.principal(runtime, client, admin.user.id);
    expect(await runtime.clientGateway.revokeTrustedClient(trustedClientId)).toBe(true);
    const call = vi.spyOn(runtime.api, "call");
    const answer = await send("snapshot", {}, { token: client.token });
    expect(answer.status).toBe(401);
    expect(answer.body.ok).toBe(false);
    expect(call).not.toHaveBeenCalled();
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
