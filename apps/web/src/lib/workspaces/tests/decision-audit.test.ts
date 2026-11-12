import { GlobalProgramApiRegistry, IdentityAccessService, registerIdentityAccessApi, type ProgramApiActor } from "fluxiq";
import { IAM_ADMINISTRATOR_ACCESS, IAM_READ_ONLY_ACCESS, MemoryIamAuditSink, type IamPolicySet, type IamStore } from "fluxiq/platform";
import { describe, expect, it } from "vitest";
import { WorkspaceDecisionAudit } from "../decision-audit";
import { serviceWorkspaceIam } from "../service-iam";
import { workspaceIam } from "../iam-options";

// Every workspace persists its route decisions on every profile: each allowed
// state change and every refusal (a refused read included), never an allowed
// read. A real registry with Identity Access's real endpoints, built as the
// program runtime builds it from the options `workspaceIam` gives, with the
// platform's audit stood in for by a memory sink. Dummy values only; scrypt at
// N=2^10.

const WORKSPACE = "workspace-main";
const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const ADMIN: ProgramApiActor = { sessionId: "session-admin", userId: "admin.one", roleId: "admin", permissions: ["programs.read", "programs.write", "flows.write", "runtime.control", "compute.control", "identity.manage", "data.manage", "secrets.manage"], channel: "panel" };
const VIEWER: ProgramApiActor = { sessionId: "session-viewer", userId: "viewer.one", roleId: "viewer", permissions: ["programs.read"], channel: "panel" };
const NOBODY: ProgramApiActor = { sessionId: "session-nobody", userId: "nobody.one", roleId: "nobody", permissions: [], channel: "panel" };

/** Under `service`: the administrator holds Administrator, the viewer Read Only, nobody nothing. */
function policiesOf(userId: string): IamPolicySet {
  const identity = userId === ADMIN.userId ? [IAM_ADMINISTRATOR_ACCESS] : userId === VIEWER.userId ? [IAM_READ_ONLY_ACCESS] : [];
  return { identity, guardrails: [], sessions: [], boundary: null };
}

const platformServices = async () => ({
  workspaceIam: () => ({ resolvePolicySet: async (principal: { id: string }) => policiesOf(principal.id), getRole: async () => null }) as unknown as IamStore
});

async function workspace(profile: "local" | "self-hosted" | "service", options: { learn?: boolean } = {}) {
  const persisted = new MemoryIamAuditSink();
  const decisions = new WorkspaceDecisionAudit(persisted);
  const iam = workspaceIam(profile === "service" ? "multi" : "single", WORKSPACE, { platformServices, audit: decisions.sink });
  const identity = new IdentityAccessService({ passwordKdf: WEAK_KDF });
  await identity.upsertUser({ id: "person.one", username: "person-one", displayName: "Person One", roleId: "viewer", password: "dummy-password" });
  // As `createGlobalProgramRuntime` builds it: the runtime's own profile over the options.
  const registry = new GlobalProgramApiRegistry({ identityAccess: identity, iam: { ...iam, profile } });
  registerIdentityAccessApi(registry, identity);
  if (options.learn !== false) decisions.learn(registry);
  const call = (endpoint: string, actor: ProgramApiActor, payload: unknown = {}) => registry.call({ programId: "identity-access", endpoint, scope: {}, actor, payload });
  const rows = () => persisted.records.map((record) => `${record.decision} ${record.action} ${record.principal.split("/").pop()}`);
  return { registry, call, rows, persisted, iam };
}

describe("a workspace's persisted route decisions", () => {
  for (const profile of ["local", "self-hosted", "service"] as const) {
    it(`${profile}: an allowed write and a refused read and write persist; an allowed read does not`, async () => {
      const { registry, call, rows } = await workspace(profile);

      expect((await call("update-user", ADMIN, { id: "person.one", displayName: "Renamed" })).ok).toBe(true);
      expect((await call("snapshot", VIEWER)).ok).toBe(true);
      expect((await call("snapshot", NOBODY)).ok).toBe(false);
      expect((await call("update-user", VIEWER, { id: "person.one", displayName: "Renamed again" })).ok).toBe(false);
      // App routes: reading the activity is a GET (dropped), an invite a POST (kept).
      expect((await registry.authorize({ actor: ADMIN, action: "iam:ListAuditEvents", permission: "identity.manage" })).allowed).toBe(true);
      expect((await registry.authorize({ actor: ADMIN, action: "iam:InviteMember", permission: "identity.manage" })).allowed).toBe(true);

      expect(rows()).toEqual([
        "allow iam:UpdateUser admin.one",
        "deny iam:Snapshot nobody.one",
        "deny iam:UpdateUser viewer.one",
        "allow iam:InviteMember admin.one"
      ]);
    });
  }

  it("names the caller in the workspace the Activity screen reads, and carries no request value", async () => {
    const { call, persisted } = await workspace("local");

    await call("update-user", ADMIN, { id: "person.one", displayName: "A secret-looking name", authorizationPassword: "dummy-password" });

    expect(persisted.records).toHaveLength(1);
    expect(persisted.records[0]).toMatchObject({ principal: `frn:fluxiq:iam:${WORKSPACE}:user/admin.one`, resources: [`frn:fluxiq:iam:${WORKSPACE}:user/person.one`] });
    expect(JSON.stringify(persisted.records)).not.toMatch(/secret-looking|dummy-password|session-admin/u);
  });

  it("keeps an allowed read of an instance it has not yet learned: a gap records more, never less", async () => {
    const { call, rows } = await workspace("local", { learn: false });

    await call("snapshot", VIEWER);

    expect(rows()).toEqual(["allow iam:Snapshot viewer.one"]);
  });
});

describe("workspaceIam", () => {
  it("leaves the service profile's IAM as serviceWorkspaceIam builds it: its policies, its workspace, the given audit", () => {
    const audit = new MemoryIamAuditSink();
    const multi = workspaceIam("multi", "ws-a", { platformServices, audit });
    const service = serviceWorkspaceIam("ws-a", { platformServices, audit });

    expect(multi).toMatchObject({ profile: "service", workspaceId: "ws-a", audit });
    expect(Object.keys(multi).sort()).toEqual(Object.keys(service).sort());
    expect(multi.source).toBeDefined();
  });

  it("adds only the audit and the workspace under one workspace: decisions stay the runtime profile's, by permission", () => {
    const audit = new MemoryIamAuditSink();
    expect(workspaceIam("single", WORKSPACE, { platformServices, audit })).toEqual({ workspaceId: WORKSPACE, audit });
  });
});
