// The registry decides every call through the IAM engine (lane B3, t803).
// Under `local` and `self-hosted` a decision equals the old
// `actor.permissions.includes(permission)`; only `service` narrows a user to
// their own resources. These pin the registry's own behaviour on small,
// synthetic registrations; the live registry is covered beside them.

import { describe, expect, it, vi } from "vitest";
import { IAM_OWNER_FULL_ACCESS, IAM_USER_ACCESS } from "../../../platform/iam/predefined/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiRegistrationParams } from "../api.ts";
import { endpointResource, ProgramIamGate, type ProgramApiIamOptions } from "../iam/index.ts";
import { actor, ADMIN_PERMISSIONS, fixedPolicySource, pinAcceptingIdentityAccess, recordingSink, registerPrefixOwners, VIEWER_PERMISSIONS } from "./iam-registry-fixtures.ts";

const ok = () => ({ ok: true as const, payload: { done: true } });

function registry(iam?: ProgramApiIamOptions, ...registrations: ProgramApiRegistrationParams[]): GlobalProgramApiRegistry {
  const built = new GlobalProgramApiRegistry({ identityAccess: pinAcceptingIdentityAccess, ...(iam === undefined ? {} : { iam }) });
  for (const registration of registrations) built.register(registration);
  return built;
}

const getFlow: ProgramApiRegistrationParams = {
  programId: "automation-studio",
  endpoint: "get-flow",
  permission: "programs.read",
  classification: "read",
  action: "studio:GetFlow",
  accessLevel: "Read",
  resource: endpointResource.projectChild("flow", "flowId"),
  handler: ok
};

const saveFlow: ProgramApiRegistrationParams = { ...getFlow, endpoint: "save-flow", permission: "programs.write", classification: "authoring", action: "studio:SaveFlow", accessLevel: "Write" };

const projects: ProgramApiRegistrationParams = {
  programId: "automation-studio",
  endpoint: "projects",
  permission: "programs.read",
  classification: "read",
  action: "studio:Projects",
  accessLevel: "Read",
  resource: endpointResource.workspace(),
  list: {
    items: (payload) => (payload as { projects: unknown[] }).projects,
    ref: (item) => ({ kind: "project", projectId: (item as { id: unknown }).id }),
    replace: (payload, kept) => ({ ...(payload as object), projects: kept })
  },
  handler: () => ({ ok: true, payload: { projects: [{ id: "a-1" }, { id: "b-1" }, { id: "x-1" }, {}], total: 4 } })
};

const call = (built: GlobalProgramApiRegistry, endpoint: string, who: ReturnType<typeof actor>, payload: unknown = {}) =>
  built.call({ programId: "automation-studio", endpoint, scope: {}, actor: who, payload });

describe("register", () => {
  it("refuses an action or access level the catalog does not derive", () => {
    expect(() => registry(undefined, { ...getFlow, action: "studio:ReadFlow" })).toThrow(/declares action studio:ReadFlow; its action is studio:GetFlow/u);
    expect(() => registry(undefined, { ...getFlow, accessLevel: "Write" })).toThrow(/declares access level Write; studio:GetFlow is Read/u);
    expect(() => registry(undefined, { ...getFlow, endpoint: "list-flows", action: "studio:ListFlows", accessLevel: "Read" })).toThrow(/studio:ListFlows is List/u);
    expect(() => registry(undefined, getFlow, { ...projects })).not.toThrow();
  });

  it("lists the declarations, never the handler", () => {
    const [summary] = registry(undefined, getFlow).endpoints();
    expect(summary).toMatchObject({ programId: "automation-studio", endpoint: "get-flow", action: "studio:GetFlow", accessLevel: "Read" });
    expect(summary).not.toHaveProperty("handler");
  });
});

describe("local and self-hosted decide exactly as the permission check did", () => {
  for (const profile of ["local", "self-hosted"] as const) {
    it(`${profile}: allows a held permission and refuses another in today's shape`, async () => {
      const built = registry({ profile }, getFlow, saveFlow);
      const viewer = actor("viewer.one", "viewer", VIEWER_PERMISSIONS);
      await expect(call(built, "get-flow", viewer, { projectId: "p", flowId: "f" })).resolves.toEqual({ ok: true, payload: { done: true } });
      await expect(call(built, "save-flow", viewer, { projectId: "p", flowId: "f" })).resolves.toEqual({ ok: false, error: "Permission required: programs.write", errorCode: "authorization.forbidden" });
    });
  }

  it("narrows a paired client below its role's policies", async () => {
    const built = registry(undefined, getFlow, saveFlow);
    const paired = actor("admin.one", "admin", ["programs.read"], "paired-client");
    await expect(call(built, "get-flow", paired)).resolves.toMatchObject({ ok: true });
    await expect(call(built, "save-flow", paired)).resolves.toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
  });

  it("never narrows a role whose permissions outgrow its predefined policy, an unmapped role, or a user", async () => {
    const built = registry(undefined, getFlow, saveFlow);
    const payload = { projectId: "someone-elses", flowId: "f" };
    await expect(call(built, "save-flow", actor("v", "viewer", ["programs.read", "programs.write"]), payload)).resolves.toMatchObject({ ok: true });
    await expect(call(built, "save-flow", actor("c", "custom-role", ["programs.write"]), payload)).resolves.toMatchObject({ ok: true });
    await expect(call(built, "save-flow", actor("u", "user", ["programs.write"]), payload)).resolves.toMatchObject({ ok: true });
    await expect(call(built, "save-flow", actor("n", "custom-role", []), payload)).resolves.toMatchObject({ errorCode: "authorization.forbidden" });
  });

  it("decides an operator action several programs share per registration", async () => {
    const shared = (programId: string, permission: ProgramApiRegistrationParams["permission"]): ProgramApiRegistrationParams => ({ programId, endpoint: "probe-state", permission, classification: "read", action: "ops:ProbeState", accessLevel: "Read", resource: endpointResource.program(), handler: ok });
    const built = registry(undefined, shared("database-manager", "data.manage"), shared("compute-control", "compute.control"));
    const who = actor("o", "custom-role", ["data.manage"]);
    await expect(built.call({ programId: "database-manager", endpoint: "probe-state", scope: {}, actor: who })).resolves.toMatchObject({ ok: true });
    await expect(built.call({ programId: "compute-control", endpoint: "probe-state", scope: {}, actor: who })).resolves.toMatchObject({ errorCode: "authorization.forbidden" });
  });

  it("gives the administrator the full-access fast path, so a list is one decision", async () => {
    const gate = new ProgramIamGate({}, () => [], new Map());
    expect((await gate.open(actor("admin.one", "admin", ADMIN_PERMISSIONS))).compiled.fullAccess).toBe(true);
    expect((await gate.open(actor("viewer.one", "viewer", VIEWER_PERMISSIONS))).compiled.fullAccess).toBe(false);
    const audit = recordingSink();
    const built = registry({ audit }, projects);
    const response = await call(built, "projects", actor("admin.one", "admin", ADMIN_PERMISSIONS));
    expect(response).toEqual(await projects.handler({ programId: "automation-studio", endpoint: "projects", scope: {} }));
    expect(audit.records.map((record) => `${record.decision} ${record.action} ${record.resources.join(",")}`)).toEqual([
      "allow studio:Projects frn:fluxiq:platform::workspace/workspace-main",
      "allow studio:Projects frn:fluxiq:platform::workspace/workspace-main"
    ]);
  });

  it("keeps every item for a viewer, one decision per item, without asking who owns them", async () => {
    const ownerOf = vi.fn(async () => "someone");
    const built = registry(undefined, projects);
    built.registerResourceOwners("project", { ownerOf });
    const response = await call(built, "projects", actor("viewer.one", "viewer", VIEWER_PERMISSIONS));
    expect((response.payload as { projects: unknown[] }).projects).toHaveLength(4);
    expect(ownerOf).not.toHaveBeenCalled();
  });

  it("still asks for the PIN after IAM allows a destructive endpoint", async () => {
    const built = new GlobalProgramApiRegistry();
    const handler = vi.fn(ok);
    built.register({ programId: "automation-studio", endpoint: "delete-flow", permission: "programs.write", classification: "destructive", handler });
    await expect(call(built, "delete-flow", actor("a", "admin", ADMIN_PERMISSIONS), { authorizationPin: "123456" })).resolves.toMatchObject({ ok: false, error: "PIN authorization service is not available." });
    expect(handler).not.toHaveBeenCalled();
  });

  it("reaches an endpoint registered after the actor's set was cached", async () => {
    const built = registry(undefined, getFlow);
    const who = actor("w", "custom-role", ["programs.write"]);
    await expect(call(built, "get-flow", who)).resolves.toMatchObject({ errorCode: "authorization.forbidden" });
    built.register(saveFlow);
    await expect(call(built, "save-flow", who)).resolves.toMatchObject({ ok: true });
  });
});

describe("service narrows a user to their own resources", () => {
  const service = (source = fixedPolicySource([IAM_USER_ACCESS])): ProgramApiIamOptions => ({ profile: "service", source });
  const alice = actor("alice", "user", ADMIN_PERMISSIONS);
  const bob = actor("bob", "user", ADMIN_PERMISSIONS);

  it("allows the owner, refuses another user, and refuses a missing id to everyone", async () => {
    const built = registry(service(), getFlow);
    registerPrefixOwners(built);
    await expect(call(built, "get-flow", alice, { projectId: "a-1", flowId: "f" })).resolves.toMatchObject({ ok: true });
    await expect(call(built, "get-flow", bob, { projectId: "a-1", flowId: "f" })).resolves.toEqual({ ok: false, error: "Not authorized: studio:GetFlow", errorCode: "authorization.forbidden" });
    await expect(call(built, "get-flow", alice, { flowId: "f" })).resolves.toMatchObject({ errorCode: "authorization.forbidden" });
    await expect(call(built, "get-flow", alice, { projectId: "a-1" })).resolves.toMatchObject({ errorCode: "authorization.forbidden" });
    await expect(call(built, "get-flow", alice, { projectId: "a/../b-1", flowId: "f" })).resolves.toMatchObject({ errorCode: "authorization.forbidden" });
  });

  it("shows a user only their own list items, and records the creator as owner", async () => {
    const recorded: Array<{ kind: string; id: string; userId: string }> = [];
    const create: ProgramApiRegistrationParams = { programId: "automation-studio", endpoint: "create-project", permission: "programs.write", classification: "authoring", action: "studio:CreateProject", accessLevel: "Write", resource: endpointResource.workspace(), creates: (payload) => ({ kind: "project", projectId: (payload as { project: { id: string } }).project.id }), handler: () => ({ ok: true, payload: { project: { id: "new-1" } } }) };
    const built = registry(service(), projects, create);
    registerPrefixOwners(built, recorded);
    await expect(call(built, "projects", bob)).resolves.toEqual({ ok: true, payload: { projects: [{ id: "b-1" }], total: 4 } });
    await expect(call(built, "create-project", bob)).resolves.toMatchObject({ ok: true });
    expect(recorded).toEqual([{ kind: "project", id: "new-1", userId: "bob" }]);
  });

  // The guardrail holds a `Deny`, so under `service` no set takes the
  // full-access fast path: even the owner's list is decided item by item.
  it("lets the workspace owner see every item, decided item by item under the guardrail", async () => {
    const ownerOf = vi.fn(async () => "someone");
    const built = registry(service(fixedPolicySource([IAM_OWNER_FULL_ACCESS])), projects);
    built.registerResourceOwners("project", { ownerOf });
    await expect(call(built, "projects", alice)).resolves.toMatchObject({ payload: { projects: [{ id: "a-1" }, { id: "b-1" }, { id: "x-1" }, {}] } });
    const gate = new ProgramIamGate({ profile: "service", source: fixedPolicySource([IAM_OWNER_FULL_ACCESS]) }, () => [], new Map());
    expect((await gate.open(alice)).compiled.fullAccess).toBe(false);
  });

  it("refuses everything without a policy source or when the source fails", async () => {
    await expect(call(registry({ profile: "service" }, getFlow), "get-flow", alice, { projectId: "a-1", flowId: "f" })).resolves.toMatchObject({ errorCode: "authorization.forbidden" });
    const failing = { resolvePolicySet: async () => { throw new Error("store unavailable"); }, getRole: async () => null };
    await expect(call(registry(service(failing), getFlow), "get-flow", alice, { projectId: "a-1", flowId: "f" })).resolves.toMatchObject({ errorCode: "authorization.forbidden" });
  });

  it("fails the call, without running the handler, when an owner cannot be read", async () => {
    const handler = vi.fn(ok);
    const built = registry(service(), { ...getFlow, handler });
    built.registerResourceOwners("project", { ownerOf: async () => { throw new Error("owner index unreadable"); } });
    await expect(call(built, "get-flow", alice, { projectId: "a-1", flowId: "f" })).resolves.toEqual({ ok: false, error: "owner index unreadable" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("narrows a paired client by its permissions as well as its policies", async () => {
    const built = registry(service(), getFlow, saveFlow);
    registerPrefixOwners(built);
    const paired = actor("alice", "user", ["programs.read"], "paired-client");
    await expect(call(built, "get-flow", paired, { projectId: "a-1", flowId: "f" })).resolves.toMatchObject({ ok: true });
    await expect(call(built, "save-flow", paired, { projectId: "a-1", flowId: "f" })).resolves.toEqual({ ok: false, error: "Permission required: programs.write", errorCode: "authorization.forbidden" });
  });
});

describe("authorize, for app routes", () => {
  it("decides a route's action by its own permission under local", async () => {
    const built = registry(undefined, getFlow);
    const viewer = actor("viewer.one", "viewer", VIEWER_PERMISSIONS);
    await expect(built.authorize({ actor: viewer, action: "studio:GetFlow", permission: "programs.write" })).resolves.toMatchObject({ allowed: false, response: { error: "Permission required: programs.write", errorCode: "authorization.forbidden" } });
    await expect(built.authorize({ actor: viewer, action: "studio:ExportRoute", permission: "programs.read" })).resolves.toMatchObject({ allowed: true });
    await expect(built.authorize({ action: "studio:ExportRoute", permission: "programs.read" })).resolves.toMatchObject({ allowed: false, response: { errorCode: "authorization.required" } });
  });

  it("decides by the caller's policies and the resources' owners under service", async () => {
    const built = registry({ profile: "service", source: fixedPolicySource([IAM_USER_ACCESS]) });
    registerPrefixOwners(built);
    const bob = actor("bob", "user", ADMIN_PERMISSIONS);
    await expect(built.authorize({ actor: bob, action: "studio:ExportProject", permission: "programs.read", resources: { kind: "project", projectId: "b-1" } })).resolves.toMatchObject({ allowed: true });
    await expect(built.authorize({ actor: bob, action: "studio:ExportProject", permission: "programs.read", resources: [{ kind: "project", projectId: "b-1" }, { kind: "project", projectId: "a-1" }] })).resolves.toMatchObject({ allowed: false });
    await expect(built.authorize({ actor: bob, action: "ops:Restart", permission: "runtime.control", resources: { kind: "program" }, programId: "runtime" })).resolves.toMatchObject({ allowed: false });
  });
});
