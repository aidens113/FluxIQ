// The create-user and update-user endpoints compare sign-in names ignoring
// case, as sign-in does: a name another person has in any case is refused by
// name (`identity.username_taken`) and nothing is written; a person's own name
// resent in another case is not a change, so it asks for no proof, and for a
// person whose name is held here it is written as sent. Account holders'
// names are covered in authority-held-elsewhere.test.ts. Dummy values only;
// scrypt at N=2^10.

import { describe, expect, it, vi } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../_shared/api.ts";
import { IdentityAccessService } from "../../runtime/service.ts";
import { IdentityUsernameTakenError } from "../../runtime/username-taken-error.ts";
import { registerIdentityAccessApi } from "../handlers.ts";

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const PASSWORD = "dummy-password";
const CALLER = "caller.admin";
const VIEWER = "plain.viewer";

async function setup() {
  const service = new IdentityAccessService({ passwordKdf: WEAK_KDF });
  await service.upsertUser({ id: CALLER, username: "caller-admin", displayName: "Caller Admin", roleId: "admin", password: PASSWORD });
  await service.upsertUser({ id: VIEWER, username: "plain-viewer", displayName: "Plain Viewer", roleId: "viewer", password: PASSWORD });
  const registry = new GlobalProgramApiRegistry();
  registerIdentityAccessApi(registry, service);
  const login = await service.authenticate({ username: "caller-admin", password: PASSWORD });
  const actor: ProgramApiActor = { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: login.role.permissions };
  const proof = { authSessionId: login.session.id, authorizationPassword: PASSWORD };
  const call = (endpoint: string, payload: Record<string, unknown>) => registry.call({ programId: "identity-access", endpoint, scope: {}, actor, payload });
  const person = async (id: string) => (await service.snapshot()).users.find((user) => user.id === id);
  return { service, proof, call, person };
}

describe("create-user", () => {
  it("refuses a name another person has in another case, by name, and creates nobody", async () => {
    const { service, proof, call } = await setup();
    const before = (await service.snapshot()).users.length;

    const answer = await call("create-user", { username: "Plain-Viewer", displayName: "Someone Else", roleId: "viewer", ...proof });

    expect(answer).toMatchObject({ ok: false, errorCode: IdentityUsernameTakenError.code });
    expect((await service.snapshot()).users).toHaveLength(before);
  });

  it("creates a person whose name nobody has in any case", async () => {
    const { proof, call } = await setup();

    expect(await call("create-user", { username: "New-Person", displayName: "New Person", roleId: "viewer", ...proof })).toMatchObject({ ok: true, payload: { username: "New-Person" } });
  });
});

describe("update-user", () => {
  it("refuses renaming a person onto another's name in another case, by name, and changes nothing", async () => {
    const { call, person } = await setup();

    const answer = await call("update-user", { id: VIEWER, username: "CALLER-ADMIN", displayName: "Renamed" });

    expect(answer).toMatchObject({ ok: false, errorCode: IdentityUsernameTakenError.code });
    expect(await person(VIEWER)).toMatchObject({ username: "plain-viewer", displayName: "Plain Viewer" });
  });

  it("takes a person's own name in another case as unchanged: no proof is asked, beside an unchanged role and on/off", async () => {
    const { call, person } = await setup();

    const answer = await call("update-user", { id: VIEWER, username: "PLAIN-VIEWER", roleId: "viewer", enabled: true, displayName: "Renamed Viewer" });

    expect(answer).toMatchObject({ ok: true, payload: { roleId: "viewer", enabled: true, displayName: "Renamed Viewer" } });
    expect(answer).not.toHaveProperty("requiresRecheck");
    expect(await person(VIEWER)).toMatchObject({ roleId: "viewer", enabled: true, displayName: "Renamed Viewer" });
  });

  it("writes a re-cased own name as sent for a person whose name is held here", async () => {
    const { service, call, person } = await setup();
    const update = vi.spyOn(service, "updateUser");

    expect(await call("update-user", { id: VIEWER, username: "Plain-Viewer" })).toMatchObject({ ok: true, payload: { username: "Plain-Viewer" } });
    expect(update.mock.calls[0]?.[0]).toMatchObject({ id: VIEWER, username: "Plain-Viewer" });
    expect((await person(VIEWER))?.username).toBe("Plain-Viewer");
  });

  it("writes no name when the name is resent exactly", async () => {
    const { service, call } = await setup();
    const update = vi.spyOn(service, "updateUser");

    expect(await call("update-user", { id: VIEWER, username: "plain-viewer", displayName: "Renamed Viewer" })).toMatchObject({ ok: true });
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("username");
  });
});
