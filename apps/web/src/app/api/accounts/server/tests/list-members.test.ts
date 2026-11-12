import { describe, expect, it } from "vitest";
import { listMembers } from "../list-members";
import { createAccountsHarness } from "./accounts-harness";

type View = { workspaceKind: string; assignableRoles: string[]; canRemove: boolean; members: { userId: string; role: string; state: string; source: string; self: boolean }[] };

describe("listMembers", () => {
  it("lists every member with role and state for an administrator, marking the viewer", async () => {
    const harness = await createAccountsHarness();
    const answer = await listMembers(await harness.deps(harness.admin));
    expect(answer.status).toBe(200);
    const view = (answer.body as { payload: View }).payload;
    expect(view.assignableRoles).toEqual(["administrator", "read-only"]);
    expect(view.canRemove).toBe(true);
    const byId = new Map(view.members.map((member) => [member.userId, member]));
    expect(byId.get(harness.owner.userId)).toMatchObject({ role: "owner", state: "active", source: "account", self: false });
    expect(byId.get(harness.admin.userId)).toMatchObject({ role: "administrator", self: true });
    expect(byId.get(harness.viewer.userId)).toMatchObject({ role: "read-only", state: "active" });
  });

  it("lists a person added before accounts as managed by Identity Access", async () => {
    const harness = await createAccountsHarness();
    const older = await harness.identityAccess.upsertUser({ username: "older", displayName: "Older Person", roleId: "viewer" });
    const view = ((await listMembers(await harness.deps(harness.admin))).body as { payload: View }).payload;
    expect(view.members.find((member) => member.userId === older.id)).toMatchObject({ source: "identity", role: "read-only" });
  });

  it("carries no secret: no session id, hash or password", async () => {
    const harness = await createAccountsHarness();
    const text = JSON.stringify(await listMembers(await harness.deps(harness.admin)));
    for (const sessionId of [harness.owner.sessionId, harness.admin.sessionId, harness.viewer.sessionId]) expect(text).not.toContain(sessionId);
    expect(text).not.toMatch(/hash|password|token|scrypt/iu);
  });

  it("never opens the platform for a refused caller", async () => {
    const harness = await createAccountsHarness();
    const deps = await harness.deps(harness.viewer);
    let opened = 0;
    const counted = async () => {
      opened += 1;
      return deps.platform();
    };
    const answer = await listMembers({ ...deps, platform: counted });
    expect(answer.status).toBe(403);
    expect(opened).toBe(0);
  });

  it("refuses a viewer on local and a member on service", async () => {
    const harness = await createAccountsHarness();
    expect(await listMembers(await harness.deps(harness.viewer))).toEqual({ status: 403, body: { ok: false, code: "forbidden", error: "Permission required: identity.manage" } });
    const member = await harness.addPerson("worker@example.test", "FluxIQUserAccess");
    expect((await listMembers(await harness.deps(member, "service"))).status).toBe(403);
    expect((await listMembers(await harness.deps(harness.admin, "service"))).status).toBe(200);
  });
});
