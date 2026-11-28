// @fluxiq-test-group real-sql
// Covers handle-program-request.ts with program-route.ts and identity-access's `get-my-preferences`: a paired client
// reads its approving person's own starting humanness through the whole route (t1095), so a task it starts runs at the
// pace the person chose in the panel. The person is the session's, never a field: a body naming anything is refused
// before the handler runs, each person's client reads only that person's value, and changing it stays the panel's.
// On the local profile with a real pairing token from the real client gateway, and on the hosted `service` profile,
// where the paired browser is narrowed by `FluxIQBrowserSession`. Dummy values only.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FluxIQ, FluxIQHostPaths } from "../../../framework/index.ts";
import { IAM_USER_ACCESS } from "../../../platform/iam/predefined/index.ts";
import { createGlobalProgramRuntime, type GlobalProgramRuntime } from "../../../programs/index.ts";
import type { ProgramApiActor } from "../../../programs/_shared/api.ts";
import { fixedPolicySource } from "../../../programs/_shared/tests/iam-registry-fixtures.ts";
import { RuntimeAccessFixture } from "../../../programs/_shared/tests/runtime-access-fixture.ts";
import { handleProgramRequest, type ProgramRouteRequest } from "../handle-program-request.ts";

type Answer = { status: number; raw: string; body: { ok: boolean; error?: string; errorCode?: string; payload?: any } };
type Caller = { token: string } | { cookie: string };

const NOT_AVAILABLE = "This endpoint is not available to a paired client.";

function request(endpoint: string, body: unknown, caller: Caller, method: "GET" | "POST"): ProgramRouteRequest {
  return {
    method,
    url: `http://127.0.0.1/api/programs/identity-access/${endpoint}`,
    programId: "identity-access",
    endpoint,
    sessionId: "cookie" in caller ? caller.cookie : undefined,
    authorization: "token" in caller ? `Bearer ${caller.token}` : null,
    readJson: async () => (body === undefined ? undefined : JSON.parse(JSON.stringify(body))),
  };
}

const answerOf = (response: { status: number; body: string }): Answer => ({ status: response.status, raw: response.body, body: JSON.parse(response.body) });

describe("a paired client reads its person's own starting humanness (local profile, real pairing)", () => {
  let fixture: RuntimeAccessFixture;
  let runtime: GlobalProgramRuntime;
  beforeEach(async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    vi.stubEnv("FLUXIQ_SECRET_KEYS_KEYRING_FILE", "");
    fixture = await RuntimeAccessFixture.create();
    runtime = fixture.boot();
  });
  afterEach(async () => {
    try {
      await fixture.dispose();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  const send = async (endpoint: string, body: unknown, caller: Caller, method: "GET" | "POST" = "POST") =>
    answerOf(await handleProgramRequest(request(endpoint, body, caller, method), { fluxiq: { programs: runtime, activeDomainId: null } as unknown as FluxIQ }));

  it("answers the approving person's own value, set in the panel, as startingHumanness alone", async () => {
    const admin = await fixture.signIn(runtime);
    const client = await fixture.pair(runtime, admin);
    expect((await send("get-my-preferences", {}, { token: client.token })).body).toEqual({ ok: true, payload: { startingHumanness: null } });
    expect((await send("update-my-preferences", { startingHumanness: 40 }, { cookie: admin.session.id })).status).toBe(200);
    for (const [body, method] of [[{}, "POST"], [undefined, "POST"], [undefined, "GET"]] as const) {
      const read = await send("get-my-preferences", body, { token: client.token }, method);
      expect(read.status, `${method} ${JSON.stringify(body)}: ${read.body.error}`).toBe(200);
      expect(read.body).toEqual({ ok: true, payload: { startingHumanness: 40 } });
    }
  });

  it("reads each person's own value through their own client, never another's", async () => {
    const admin = await fixture.signIn(runtime);
    await runtime.identityAccess.upsertRole({ id: "member", permissions: ["programs.read", "programs.write", "runtime.control", "flows.write"] });
    await runtime.identityAccess.upsertUser({ username: "member", displayName: "Member", roleId: "member", password: "member-password-for-tests" });
    const member = await fixture.signIn(runtime, "member", "member-password-for-tests");
    expect((await send("update-my-preferences", { startingHumanness: 40 }, { cookie: admin.session.id })).status).toBe(200);
    expect((await send("update-my-preferences", { startingHumanness: 10 }, { cookie: member.session.id })).status).toBe(200);
    const adminsClient = await fixture.pair(runtime, admin);
    const membersClient = await fixture.pair(runtime, member);
    expect((await send("get-my-preferences", {}, { token: adminsClient.token })).body.payload).toEqual({ startingHumanness: 40 });
    expect((await send("get-my-preferences", {}, { token: membersClient.token })).body.payload).toEqual({ startingHumanness: 10 });
  });

  it("refuses a body with any field before the handler runs, the person's own id included", async () => {
    const admin = await fixture.signIn(runtime);
    const client = await fixture.pair(runtime, admin);
    const call = vi.spyOn(runtime.api, "call");
    for (const body of [{ userId: "someone-else" }, { userId: admin.user.id }, { id: admin.user.id }, { startingHumanness: 5 }, { user: { id: "someone-else" } }]) {
      const read = await send("get-my-preferences", body, { token: client.token });
      expect(read.status, JSON.stringify(body)).toBe(403);
      expect(read.body).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
      expect(read.body.error, JSON.stringify(body)).toMatch(/^A paired client's read of its person's preferences may not carry /u);
    }
    expect(call).not.toHaveBeenCalled();
    // An auth session a token names is removed before narrowing, as on every endpoint, so it reaches nothing.
    const withSession = await send("get-my-preferences", { authSessionId: admin.session.id }, { token: client.token });
    expect(withSession.status, withSession.body.error).toBe(200);
    expect(call.mock.calls.at(-1)?.[0].payload).toEqual({});
  });

  it("refuses a token every change to the preferences, and every other identity endpoint, before its handler runs", async () => {
    const admin = await fixture.signIn(runtime);
    const client = await fixture.pair(runtime, admin);
    expect((await send("update-my-preferences", { startingHumanness: 30 }, { cookie: admin.session.id })).status).toBe(200);
    const call = vi.spyOn(runtime.api, "call");
    for (const [endpoint, body] of [["update-my-preferences", { startingHumanness: 90 }], ["update-my-preferences", { startingHumanness: null }], ["snapshot", {}], ["recase-my-username", { username: "ADMIN" }], ["set-password", {}]] as const) {
      const answer = await send(endpoint, body, { token: client.token });
      expect(answer.status, endpoint).toBe(403);
      expect(answer.body.error, endpoint).toBe(NOT_AVAILABLE);
    }
    expect(call).not.toHaveBeenCalled();
    expect((await send("get-my-preferences", {}, { token: client.token })).body.payload).toEqual({ startingHumanness: 30 });
  });

  it("refuses a revoked pairing's token before any handler runs", async () => {
    const admin = await fixture.signIn(runtime);
    const client = await fixture.pair(runtime, admin);
    const { trustedClientId } = await fixture.principal(runtime, client, admin.user.id);
    expect(await runtime.clientGateway.revokeTrustedClient(trustedClientId)).toBe(true);
    const call = vi.spyOn(runtime.api, "call");
    expect((await send("get-my-preferences", {}, { token: client.token })).status).toBe(401);
    expect(call).not.toHaveBeenCalled();
  });
});

// Every path. The config is not named `config.json`, so the runtime takes the plain data-directory layout.
function pathsAt(root: string): FluxIQHostPaths {
  const fluxiq = path.join(root, ".fluxiq");
  const at = (name: string) => path.join(fluxiq, name);
  return {
    root, fluxiq, config: at("fluxiq.json"), data: at("data"), databases: at("databases"), inputs: at("inputs"), outputs: at("outputs"),
    streams: at("streams"), domains: at("domains"), domainPrograms: at("domain-programs"), domainInputs: at("domain-inputs"),
    domainOutputs: at("domain-outputs"), domainConfigs: at("domain-configs"), domainData: at("domain-data"), domainDatabases: at("domain-databases"),
    recordings: at("recordings"), policies: at("policies"), logs: at("logs"), temp: at("temp"),
  };
}

describe("a paired client reads its person's own starting humanness (service profile, FluxIQBrowserSession)", () => {
  const TOKEN = "pairing-token-secret-value";
  const PERMISSIONS = ["programs.read", "programs.write", "runtime.control", "flows.write"] as ProgramApiActor["permissions"];
  const ALICE = "user.alice";
  const BOB = "user.bob";
  let root = "";
  let runtime: GlobalProgramRuntime;
  let session: { sessionId: string; operatorUserId: string; metadata: { domainId: string }; projectId: string | null };

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-paired-preferences-"));
    runtime = createGlobalProgramRuntime(pathsAt(root), { modelProvidersEnabled: false, iam: { profile: "service", source: fixedPolicySource([IAM_USER_ACCESS]) } });
    await runtime.identityAccess.upsertUser({ id: ALICE, username: "alice", displayName: "Alice", roleId: "viewer" });
    await runtime.identityAccess.upsertUser({ id: BOB, username: "bob", displayName: "Bob", roleId: "viewer" });
    await runtime.identityAccess.preferences.setStartingHumanness(ALICE, 55);
    await runtime.identityAccess.preferences.setStartingHumanness(BOB, 20);
    session = { sessionId: "g1", operatorUserId: ALICE, metadata: { domainId: "example" }, projectId: null };
  });
  afterEach(async () => {
    runtime.secretKeys.close();
    runtime.detach();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const fluxiq = () => ({
    programs: { api: runtime.api, automationStudio: runtime.automationStudio, clientGateway: { authorizeToken: async (token: string) => (token === TOKEN ? session : null) } },
  }) as unknown as FluxIQ;
  const identityAuthority = {
    validateSession: async () => null,
    snapshot: async () => ({ users: [{ id: ALICE, roleId: "viewer", enabled: true }, { id: BOB, roleId: "viewer", enabled: true }], roles: [{ id: "viewer", permissions: PERMISSIONS }] }),
  };
  const send = async (endpoint: string, body: unknown) => answerOf(await handleProgramRequest(request(endpoint, body, { token: TOKEN }, "POST"), { fluxiq: fluxiq(), identityAuthority }));

  it("answers the approving person's own value, allowed by the session policy on their own user alone", async () => {
    const read = await send("get-my-preferences", {});
    expect(read.status, read.body.error).toBe(200);
    expect(read.body).toEqual({ ok: true, payload: { startingHumanness: 55 } });
    session = { ...session, operatorUserId: BOB };
    expect((await send("get-my-preferences", {})).body).toEqual({ ok: true, payload: { startingHumanness: 20 } });
  });

  it("refuses a change, and a body naming a person, and leaves the value as it was", async () => {
    expect((await send("update-my-preferences", { startingHumanness: 90 })).status).toBe(403);
    expect((await send("get-my-preferences", { userId: BOB })).status).toBe(403);
    expect(await runtime.identityAccess.preferences.startingHumanness(ALICE)).toBe(55);
    expect(await runtime.identityAccess.preferences.startingHumanness(BOB)).toBe(20);
  });
});
