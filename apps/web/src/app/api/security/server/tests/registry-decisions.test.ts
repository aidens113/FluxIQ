import { GlobalProgramApiRegistry, IdentityAccessService, registerIdentityAccessApi, type ProgramApiActor } from "fluxiq";
import { IAM_USER_ACCESS, MemoryIamAuditSink } from "fluxiq/platform";
import { describe, expect, it } from "vitest";
import type { ActivityPage } from "../../../../../features/security/activity/model";
import { WorkspaceDecisionAudit, workspaceIam } from "../../../../../lib/workspaces";
import { readActivity } from "../read-activity";
import { auditHarness, memoryAudit, OTHER_WORKSPACE, WORKSPACE } from "./audit-harness";

// The route decisions a workspace persists on `local` and `self-hosted` reach
// the Activity screen: who changed what and every refused attempt, for the
// caller's own workspace only, with no request value in an entry. Real
// registries record through the web's decision audit into one shared memory
// sink standing in for the platform's; the Activity handler reads it back.
// Dummy values only; scrypt at N=2^10.

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const ADMIN: ProgramApiActor = { sessionId: "session-admin-dummy", userId: "ana", roleId: "admin", permissions: ["programs.read", "programs.write", "flows.write", "runtime.control", "compute.control", "identity.manage", "data.manage", "secrets.manage"], channel: "panel" };
const VIEWER: ProgramApiActor = { sessionId: "session-viewer-dummy", userId: "cy", roleId: "viewer", permissions: ["programs.read"], channel: "panel" };
const NOBODY: ProgramApiActor = { sessionId: "session-nobody-dummy", userId: "di", roleId: "nobody", permissions: [], channel: "panel" };

async function workspaceRegistry(workspaceId: string, decisions: WorkspaceDecisionAudit, profile: "local" | "self-hosted") {
  const identity = new IdentityAccessService({ passwordKdf: WEAK_KDF });
  await identity.upsertUser({ id: "person.one", username: "person-one", displayName: "Person One", roleId: "viewer", password: "dummy-password" });
  const iam = workspaceIam("single", workspaceId, { platformServices: async () => { throw new Error("not used under one workspace"); }, audit: decisions.sink });
  const registry = new GlobalProgramApiRegistry({ identityAccess: identity, iam: { ...iam, profile } });
  registerIdentityAccessApi(registry, identity);
  decisions.learn(registry);
  return (endpoint: string, actor: ProgramApiActor, payload: unknown = {}) => registry.call({ programId: "identity-access", endpoint, scope: {}, actor, payload });
}

describe("Activity shows the persisted route decisions", () => {
  for (const profile of ["local", "self-hosted"] as const) {
    it(`${profile}: the caller's workspace's changes and refusals, never an allowed read or another workspace's`, async () => {
      const persisted = new MemoryIamAuditSink();
      const decisions = new WorkspaceDecisionAudit(persisted);
      const mine = await workspaceRegistry(WORKSPACE, decisions, profile);
      const theirs = await workspaceRegistry(OTHER_WORKSPACE, decisions, profile);

      await mine("update-user", ADMIN, { id: "person.one", displayName: "Renamed dummy", authorizationPassword: "dummy-password" });
      await mine("snapshot", VIEWER);
      await mine("snapshot", NOBODY);
      await mine("update-user", VIEWER, { id: "person.one", displayName: "Renamed again dummy" });
      await theirs("update-user", ADMIN, { id: "person.one", displayName: "Elsewhere dummy" });

      const harness = auditHarness({ audit: memoryAudit([...persisted.records]), tenancy: "single", names: { ana: "Ana", cy: "Cy", di: "Di" } });
      const answer = await readActivity(harness.deps, null);
      const page = (answer.body as { payload: ActivityPage }).payload;

      expect(answer.status).toBe(200);
      expect(page.entries.map((entry) => [entry.who, entry.action, entry.outcome])).toEqual([
        ["Cy", "iam:UpdateUser", "denied"],
        ["Di", "iam:Snapshot", "denied"],
        ["Ana", "iam:UpdateUser", "allowed"]
      ]);
      expect(JSON.stringify(page)).not.toMatch(/dummy|session-|requestId|ipPrefix|matched|frn:/u);
    });
  }
});

describe("Activity shows a partly hidden list once", () => {
  // A member under `service` sees only their own projects. The list's request
  // persists one refusal carrying how many items it hid, never one per item,
  // and Activity shows it as one entry with that count.
  const ITEMS = [{ id: "a-1" }, { id: "b-1" }, { id: "x-1" }, { id: "b-2" }, { id: "a-2" }];
  const BO: ProgramApiActor = { sessionId: "session-bo-dummy", userId: "bo", roleId: "user", permissions: ["programs.read"], channel: "panel" };

  it("service: one denied entry naming the list and how many items it hid", async () => {
    const persisted = new MemoryIamAuditSink();
    const decisions = new WorkspaceDecisionAudit(persisted);
    const registry = new GlobalProgramApiRegistry({
      iam: { profile: "service", workspaceId: WORKSPACE, audit: decisions.sink, source: { resolvePolicySet: async () => ({ identity: [IAM_USER_ACCESS], guardrails: [], sessions: [], boundary: null }), getRole: async () => null } }
    });
    registry.register({
      programId: "automation-studio",
      endpoint: "projects",
      permission: "programs.read",
      classification: "read",
      action: "studio:Projects",
      accessLevel: "Read",
      resource: { types: ["*"], of: () => ({ kind: "workspace" }) },
      list: {
        items: (payload) => (payload as { projects: unknown[] }).projects,
        ref: (item) => ({ kind: "project", projectId: (item as { id: string }).id }),
        replace: (payload, kept) => ({ ...(payload as object), projects: kept })
      },
      handler: () => ({ ok: true, payload: { projects: ITEMS } })
    });
    registry.registerResourceOwners("project", { ownerOf: async (id) => (id.startsWith("b-") ? "bo" : "someone-else"), recordOwner: async () => undefined });
    decisions.learn(registry);

    const listed = await registry.call({ programId: "automation-studio", endpoint: "projects", scope: {}, actor: BO, payload: {} });
    expect(listed).toEqual({ ok: true, payload: { projects: [{ id: "b-1" }, { id: "b-2" }] } });
    expect(persisted.records.map((row) => [row.category, row.action, row.resources, row.hidden])).toEqual([["deny", "studio:Projects", [`frn:fluxiq:platform::workspace/${WORKSPACE}`], 3]]);

    const harness = auditHarness({ audit: memoryAudit([...persisted.records]), names: { bo: "Bo" } });
    const page = (await readActivity(harness.deps, null)).body as { payload: ActivityPage };
    expect(page.payload.entries).toEqual([{ at: persisted.records[0]!.time * 1000, who: "Bo", action: "studio:Projects", outcome: "denied", resources: ["This workspace"], hidden: 3 }]);
  });
});
