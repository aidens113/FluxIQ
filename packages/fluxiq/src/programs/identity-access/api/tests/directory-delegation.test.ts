// A person's own sign-in security in an instance whose people sign in through
// another directory (a hosted tenant workspace and the platform's Identity
// Access): the self-service endpoints act there, and only for the caller,
// whatever role the caller holds; the instance's own store is never touched.
// Passwords are dummy values; derivations run at the test-only N=2^10.

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../_shared/api.ts";
import { IdentityAccessService } from "../../runtime/service.ts";
import { IDENTITY_DIRECTORY_ERRORS } from "../contracts.ts";
import { registerIdentityAccessApi } from "../handlers.ts";

const WEAK = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const PASSWORD = "dummy-password";

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

async function setup() {
  const platform = new IdentityAccessService({ passwordKdf: WEAK });
  await platform.upsertUser({ id: "person.admin", username: "admin@example.test", displayName: "Admin", roleId: "admin", password: PASSWORD });
  await platform.upsertUser({ id: "person.other", username: "other@example.test", displayName: "Other", roleId: "admin", password: PASSWORD });
  const admin = await platform.authenticate({ username: "admin@example.test", password: PASSWORD });
  const other = await platform.authenticate({ username: "other@example.test", password: PASSWORD });
  const tenant = new IdentityAccessService({ passwordKdf: WEAK });
  const before = JSON.stringify(await tenant.snapshot());
  tenant.directory.actOn(async () => platform);
  const registry = new GlobalProgramApiRegistry();
  registerIdentityAccessApi(registry, tenant);
  const actor: ProgramApiActor = { sessionId: admin.session.id, userId: admin.user.id, roleId: admin.role.id, permissions: admin.role.permissions };
  const proof = { authSessionId: admin.session.id, authorizationPassword: PASSWORD };
  const call = (endpoint: string, payload?: unknown) => registry.call({ programId: "identity-access", endpoint, scope: {}, actor, ...(payload === undefined ? {} : { payload }) });
  const digestOf = async (userId: string) => (await platform.snapshot()).sessions.find((session) => session.userId === userId)!.id;
  const tenantUnchanged = async () => expect(JSON.stringify(await tenant.snapshot())).toBe(before);
  return { platform, tenant, admin, other, actor, proof, call, digestOf, tenantUnchanged };
}

describe("self-service through another identity directory", () => {
  it("enrols, confirms and turns off the caller's own authenticator on the directory", async () => {
    const f = await setup();
    const begun = await f.call("begin-totp", { userId: f.admin.user.id, ...f.proof });
    expect(begun).toMatchObject({ ok: true });
    const secret = (begun as { payload: { secret: string } }).payload.secret;
    await expect(f.call("confirm-totp", { userId: f.admin.user.id, code: totpCode(secret), ...f.proof })).resolves.toMatchObject({ ok: true, payload: { id: f.admin.user.id, totpEnabled: true } });
    expect((await f.platform.snapshot()).users.find((user) => user.id === f.admin.user.id)?.totpEnabled).toBe(true);
    await expect(f.call("disable-totp", { userId: f.admin.user.id, ...f.proof, authorizationTotp: totpCode(secret) })).resolves.toMatchObject({ ok: true, payload: { totpEnabled: false } });
    await f.tenantUnchanged();
  });

  it("refuses another person's authenticator, whatever role the caller holds, before any credential is spent", async () => {
    const f = await setup();
    for (const endpoint of ["begin-totp", "disable-totp"]) {
      await expect(f.call(endpoint, { userId: f.other.user.id, ...f.proof })).resolves.toEqual({ ok: false, error: expect.any(String), errorCode: IDENTITY_DIRECTORY_ERRORS.selfOnly });
    }
    await expect(f.call("confirm-totp", { userId: f.other.user.id, code: "000000", ...f.proof })).resolves.toMatchObject({ ok: false, errorCode: IDENTITY_DIRECTORY_ERRORS.selfOnly });
    await f.tenantUnchanged();
  });

  it("reads and writes the caller's own preferences, and re-cases their own name, on the directory", async () => {
    const f = await setup();
    await expect(f.call("update-my-preferences", { startingHumanness: 40 })).resolves.toEqual({ ok: true, payload: { startingHumanness: 40 } });
    await expect(f.platform.preferences.startingHumanness(f.admin.user.id)).resolves.toBe(40);
    await expect(f.call("get-my-preferences")).resolves.toEqual({ ok: true, payload: { startingHumanness: 40 } });
    await expect(f.call("recase-my-username", { username: "Admin@Example.test" })).resolves.toMatchObject({ ok: true, payload: { username: "Admin@Example.test" } });
    expect((await f.platform.snapshot()).users.find((user) => user.id === f.admin.user.id)?.username).toBe("Admin@Example.test");
    await f.tenantUnchanged();
  });

  it("revokes only the caller's own sessions, by digest or raw id, as themselves", async () => {
    const f = await setup();
    const second = await f.platform.authenticate({ username: "admin@example.test", password: PASSWORD });
    await expect(f.call("revoke-session", { sessionDigest: await f.digestOf(f.other.user.id) })).resolves.toMatchObject({ ok: false, errorCode: IDENTITY_DIRECTORY_ERRORS.selfOnly });
    await expect(f.call("revoke-session", { sessionId: f.other.session.id })).resolves.toMatchObject({ ok: false, errorCode: IDENTITY_DIRECTORY_ERRORS.selfOnly });
    await expect(f.platform.validateSession(f.other.session.id)).resolves.not.toBeNull();
    await expect(f.call("revoke-session", { sessionId: second.session.id })).resolves.toEqual({ ok: true, payload: { revoked: true } });
    await expect(f.platform.validateSession(second.session.id)).resolves.toBeNull();
    await expect(f.call("revoke-session", { sessionDigest: await f.digestOf(f.admin.user.id) })).resolves.toEqual({ ok: true, payload: { revoked: true } });
    expect((await f.platform.snapshot()).sessions.map((session) => session.userId)).toEqual([f.other.user.id]);
    await f.tenantUnchanged();
  });

  it("lists the caller alone, with their own sessions, never another person of the directory", async () => {
    const f = await setup();
    const answer = await f.call("snapshot");
    expect(answer).toMatchObject({ ok: true });
    const listing = (answer as { payload: { users: Array<{ id: string }>; sessions: Array<{ userId: string }>; roles: Array<{ id: string }> } }).payload;
    expect(listing.users.map((user) => user.id)).toEqual([f.admin.user.id]);
    expect(new Set(listing.sessions.map((session) => session.userId))).toEqual(new Set([f.admin.user.id]));
    expect(listing.roles.map((role) => role.id)).toEqual(["admin"]);
  });

  it("is set once: the same directory again is a no-op, another is refused", async () => {
    const tenant = new IdentityAccessService({ passwordKdf: WEAK });
    const directory = async () => tenant;
    tenant.directory.actOn(directory);
    expect(() => tenant.directory.actOn(directory)).not.toThrow();
    expect(() => tenant.directory.actOn(async () => tenant)).toThrow("identity.directory_set");
  });
});
