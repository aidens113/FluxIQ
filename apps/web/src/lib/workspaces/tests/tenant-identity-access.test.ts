import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GlobalProgramApiRegistry, IdentityAccessService, registerIdentityAccessApi, type FluxIQ, type ProgramApiActor } from "fluxiq";
import { createPlatformServices, MemoryEmailSender, MemoryIamAuditSink, type PlatformServices } from "fluxiq/platform";
import { HeldKeys } from "fluxiq/secret-keys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DUMMY_PASSWORD, MemoryRecordRepository, WEAK_KDF } from "../../../app/api/accounts/server/tests/accounts-harness";
import { createTenantFluxIQ } from "../create-tenant";
import { serviceWorkspaceIam } from "../service-iam";

vi.mock("../initialize-storage", () => ({ initializeFluxIQWebStorage: async () => undefined }));

// Identity Access in hosted tenant workspaces (`service`, two tenants). Each
// tenant instance is built by `createTenantFluxIQ` with the platform's
// Identity Access as its identity directory, and its registry decides by the
// tenant's IAM under `FluxIQServiceGuardrail`, as production builds them.
//
// What the panel calls (features/security and the settings page): snapshot,
// create-user, update-user, set-password, set-pin, begin/confirm/disable-totp,
// revoke-session, get/update-my-preferences and recase-my-username. Before
// this change, under `service` the self-service ones acted on the tenant's own
// user store, where nobody signs in: preferences were written for no one
// ("Unknown or disabled user"), re-casing and every credential recheck failed
// ("Authentication required", the session lives on the platform), and the
// member administration ones could only ever make tenant-local people.

const roots: string[] = [];
let services: PlatformServices;
let platform: IdentityAccessService;
let requests = 0;

type Person = { actor: ProgramApiActor; proof: { authSessionId: string; authorizationPassword: string } };
type Tenant = { local: IdentityAccessService; call(who: Person, endpoint: string, payload?: unknown): Promise<{ ok: boolean; payload?: unknown; errorCode?: string }> };

beforeEach(async () => {
  vi.stubEnv("FLUXIQ_PROFILE", "service");
  const repository = new MemoryRecordRepository();
  platform = new IdentityAccessService({ repository: new MemoryRecordRepository(), passwordKdf: WEAK_KDF });
  services = await createPlatformServices({ repository, iamRepository: repository, identity: platform, email: new MemoryEmailSender(), auditSink: new MemoryIamAuditSink(), publicOrigin: "https://app.example.test/", tenancy: { mode: "multi" }, entitlements: { organisation: true } });
  for (const workspaceId of ["tenant-a", "tenant-b"]) await services.store.putWorkspace({ workspaceId, kind: "organisation", ownerUserId: null, createdAtMs: 1 });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function person(email: string, workspace: string, policy: string): Promise<Person> {
  const answer = await services.provisioning.run("createAccount", { requestId: `tenant-identity-${(requests += 1)}`, email, displayName: email, policies: [policy], workspace, password: DUMMY_PASSWORD }, { kind: "in-process", actorUserId: null, transport: "in-process" });
  if (!answer.ok || answer.result.status !== "created") throw new Error("fixture person was not created");
  const login = await platform.authenticate({ username: email, password: DUMMY_PASSWORD });
  return {
    actor: { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: login.role.permissions, channel: "panel" },
    proof: { authSessionId: login.session.id, authorizationPassword: DUMMY_PASSWORD }
  };
}

/** A tenant instance as the workspace manager opens one: its own Identity Access store and registry, and the platform as its identity directory. */
async function tenant(workspaceId: string): Promise<Tenant> {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-tenant-identity-"));
  roots.push(dataRoot);
  const local = new IdentityAccessService({ repository: new MemoryRecordRepository(), passwordKdf: WEAK_KDF });
  local.firstRun.startUnclaimed();
  const api = new GlobalProgramApiRegistry({ iam: serviceWorkspaceIam(workspaceId, { platformServices: async () => services, audit: new MemoryIamAuditSink() }) });
  registerIdentityAccessApi(api, local);
  const fluxiq = { programs: { identityAccess: local, api }, close: async () => undefined } as unknown as FluxIQ;
  await createTenantFluxIQ({ dataRoot, workspaceId, heldKeys: new HeldKeys(), instantiate: () => fluxiq, identityDirectory: async () => platform, env: {} });
  return {
    local,
    call: async (who, endpoint, payload) => await api.call({ programId: "identity-access", endpoint, scope: {}, actor: who.actor, ...(payload === undefined ? {} : { payload }) }) as { ok: boolean; payload?: unknown; errorCode?: string }
  };
}

async function twoTenants() {
  const adminA = await person("admin-a@example.test", "tenant-a", "FluxIQAdministratorAccess");
  const memberA = await person("member-a@example.test", "tenant-a", "FluxIQUserAccess");
  const adminB = await person("admin-b@example.test", "tenant-b", "FluxIQAdministratorAccess");
  const memberB = await person("member-b@example.test", "tenant-b", "FluxIQUserAccess");
  const a = await tenant("tenant-a");
  const b = await tenant("tenant-b");
  const localUsers = async () => [(await a.local.snapshot()).users.length, (await b.local.snapshot()).users.length];
  return { adminA, memberA, adminB, memberB, a, b, localUsers };
}

/** The current six-digit code of a base32 authenticator secret (RFC 6238, SHA-1, 30 seconds). */
function totpCode(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.toUpperCase()].map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from(bits.match(/.{8}/gu)!.map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0xf;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const digestOf = async (userId: string) => (await platform.snapshot()).sessions.find((session) => session.userId === userId)!.id;

describe("tenant identity access under the hosted service", () => {
  it("denies local member administration to a workspace administrator, by the guardrail, before any handler runs", async () => {
    const { adminA, a, localUsers } = await twoTenants();
    const before = await localUsers();
    const attempts: Array<[string, Record<string, unknown>]> = [
      ["create-user", { username: "local", displayName: "Local", roleId: "viewer", password: DUMMY_PASSWORD, ...adminA.proof }],
      ["update-user", { id: adminA.actor.userId, displayName: "Renamed" }],
      ["set-password", { userId: adminA.actor.userId, value: "another dummy value", ...adminA.proof }],
      ["set-pin", { userId: adminA.actor.userId, value: "246810", ...adminA.proof }],
      ["create-session", { userId: adminA.actor.userId, ...adminA.proof }],
      ["unlock-vault", { userId: adminA.actor.userId, password: DUMMY_PASSWORD, ...adminA.proof }]
    ];
    for (const [endpoint, payload] of attempts) {
      expect(await a.call(adminA, endpoint, payload), endpoint).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    }
    expect(await localUsers()).toEqual(before);
    expect((await platform.snapshot()).users.find((user) => user.id === adminA.actor.userId)?.displayName).toBe("admin-a@example.test");
  });

  it("acts on the platform directory for a person's own preferences, name and authenticator", async () => {
    const { adminA, memberA, a, b, localUsers } = await twoTenants();
    expect(await a.call(memberA, "update-my-preferences", { startingHumanness: 35 })).toEqual({ ok: true, payload: { startingHumanness: 35 } });
    await expect(platform.preferences.startingHumanness(memberA.actor.userId)).resolves.toBe(35);
    expect(await a.call(memberA, "get-my-preferences")).toEqual({ ok: true, payload: { startingHumanness: 35 } });
    expect(await a.call(memberA, "recase-my-username", { username: "Member-A@example.test" })).toMatchObject({ ok: true, payload: { username: "Member-A@example.test" } });
    const begun = await a.call(adminA, "begin-totp", { userId: adminA.actor.userId, ...adminA.proof });
    expect(begun).toMatchObject({ ok: true });
    const { secret } = begun.payload as { secret: string };
    expect(await a.call(adminA, "confirm-totp", { userId: adminA.actor.userId, code: totpCode(secret), ...adminA.proof })).toMatchObject({ ok: true, payload: { totpEnabled: true } });
    expect((await platform.snapshot()).users.find((user) => user.id === adminA.actor.userId)?.totpEnabled).toBe(true);
    // A member's own authenticator too: their policy grants it on their own user.
    expect(await a.call(memberA, "begin-totp", { userId: memberA.actor.userId, ...memberA.proof })).toMatchObject({ ok: true });
    expect(await localUsers()).toEqual([0, 0]);
    // Tenant B sees nothing of it: its own store holds no one either.
    expect((await b.local.snapshot()).users).toEqual([]);
  });

  it("signs out only the caller's own sessions, on the platform directory", async () => {
    const { adminA, memberA, adminB, a } = await twoTenants();
    const second = await platform.authenticate({ username: "member-a@example.test", password: DUMMY_PASSWORD });
    expect(await a.call(memberA, "revoke-session", { sessionId: second.session.id })).toEqual({ ok: true, payload: { revoked: true } });
    await expect(platform.validateSession(second.session.id)).resolves.toBeNull();
    // An administrator of A has no authority over another person's sign-in, in A or in B.
    expect(await a.call(adminA, "revoke-session", { sessionDigest: await digestOf(memberA.actor.userId) })).toMatchObject({ ok: false, errorCode: "identity.directory_self_only" });
    expect(await a.call(adminA, "revoke-session", { sessionDigest: await digestOf(adminB.actor.userId) })).toMatchObject({ ok: false, errorCode: "identity.directory_self_only" });
    await expect(platform.validateSession(memberA.actor.sessionId)).resolves.not.toBeNull();
    await expect(platform.validateSession(adminB.actor.sessionId)).resolves.not.toBeNull();
  });

  it("crosses no tenant: another person's authenticator is refused, and the listing is the caller alone", async () => {
    const { adminA, memberA, adminB, memberB, a } = await twoTenants();
    for (const target of [memberA, adminB, memberB]) {
      const answer = await a.call(adminA, "disable-totp", { userId: target.actor.userId, ...adminA.proof });
      // Another tenant's person is outside A's IAM; a person of A is outside a person's own sign-in.
      expect(answer.ok).toBe(false);
      expect(["identity.directory_self_only", "authorization.forbidden"]).toContain(answer.errorCode);
    }
    const listing = await a.call(adminA, "snapshot");
    expect(listing).toMatchObject({ ok: true });
    const { users, sessions } = listing.payload as { users: Array<{ id: string }>; sessions: Array<{ userId: string }> };
    expect(users.map((user) => user.id)).toEqual([adminA.actor.userId]);
    expect(new Set(sessions.map((session) => session.userId))).toEqual(new Set([adminA.actor.userId]));
    expect(JSON.stringify(listing)).not.toContain("admin-b@example.test");
  });
});
