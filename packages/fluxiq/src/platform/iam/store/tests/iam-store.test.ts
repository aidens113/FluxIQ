import { describe, expect, it } from "vitest";
import type { IamAuditRecord, IamAuditSink, IamPolicy, IamPrincipal } from "../../types.ts";
import { IamStore } from "../iam-store.ts";
import type { IamRecordEnvelope, IamRecordRepository, IamRecordScope } from "../repository/index.ts";
import { IamStoreError } from "../errors/index.ts";

const WORKSPACE = "w1";
const VERSION = "2026-10-30";

function allowDocument(action: string): unknown {
  return { Version: VERSION, Statement: [{ Effect: "Allow", Action: action, Resource: "*" }] };
}

function denyDocument(action: string): unknown {
  return { Version: VERSION, Statement: [{ Effect: "Deny", Action: action, Resource: "*" }] };
}

const TRUST = { Version: VERSION, Statement: [{ Effect: "Allow", Principal: { FluxIQ: "*" }, Action: "iam:AssumeRole" }] };

class MemoryRepository implements IamRecordRepository {
  readonly rows = new Map<string, IamRecordEnvelope>();

  private key(id: string, scope?: IamRecordScope): string {
    return `${scope?.domainId ?? ""}|${id}`;
  }

  async list(scope?: IamRecordScope): Promise<IamRecordEnvelope[]> {
    return [...this.rows.values()].filter((row) => (row.scope.domainId ?? null) === (scope?.domainId ?? null));
  }

  async get(id: string, scope?: IamRecordScope): Promise<IamRecordEnvelope | null> {
    return this.rows.get(this.key(id, scope)) ?? null;
  }

  async put(record: IamRecordEnvelope): Promise<IamRecordEnvelope> {
    this.rows.set(this.key(record.id, record.scope), structuredClone(record));
    return record;
  }

  async delete(id: string, scope?: IamRecordScope): Promise<boolean> {
    return this.rows.delete(this.key(id, scope));
  }
}

class MemorySink implements IamAuditSink {
  readonly records: IamAuditRecord[] = [];

  record(record: IamAuditRecord): void {
    this.records.push(record);
  }

  async flush(): Promise<void> {}
}

const predefined: Record<string, IamPolicy> = {
  FluxIQUserAccess: { name: "FluxIQUserAccess", kind: "identity", document: allowDocument("studio:*") as IamPolicy["document"] },
  FluxIQServiceGuardrail: { name: "FluxIQServiceGuardrail", kind: "guardrail", document: denyDocument("iam:Delete*") as IamPolicy["document"] }
};

const context = { actor: "frn:fluxiq:iam:w1:user/admin", origin: "panel", requestId: "req-1" } as const;

function setup() {
  const repository = new MemoryRepository();
  const sink = new MemorySink();
  const store = new IamStore({ workspaceId: WORKSPACE, repository, resolveManagedPolicy: (name) => predefined[name] ?? null, auditSink: sink, now: () => 5000 });
  return { repository, sink, store };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof IamStoreError) return error.code;
    throw error;
  }
  return "no error";
}

function user(store: IamStore, id: string): IamPrincipal {
  return { type: "user", id, workspaceId: WORKSPACE, frn: store.principalFrn("user", id) };
}

describe("IamStore managed policies", () => {
  it("creates, versions, defaults and deletes a customer-managed policy", async () => {
    const { store } = setup();
    const created = await store.createPolicy("Reader", "identity", allowDocument("studio:Get*"), context);
    expect(created.defaultVersionId).toBe("v1");
    const v2 = await store.createPolicyVersion("Reader", allowDocument("studio:List*"), false, context);
    expect(v2.id).toBe("v2");
    expect((await store.getPolicy("Reader"))?.defaultVersionId).toBe("v1");
    await store.setDefaultPolicyVersion("Reader", "v2", context);
    expect(await codeOf(store.deletePolicyVersion("Reader", "v2", context))).toBe("default_version");
    await store.deletePolicyVersion("Reader", "v1", context);
    expect((await store.getPolicy("Reader"))?.versions.map((version) => version.id)).toEqual(["v2"]);
    await store.deletePolicy("Reader", context);
    expect(await store.getPolicy("Reader")).toBeNull();
  });

  it("caps versions at five", async () => {
    const { store } = setup();
    await store.createPolicy("Capped", "identity", allowDocument("studio:Get*"), context);
    for (let index = 0; index < 4; index += 1) await store.createPolicyVersion("Capped", allowDocument("studio:Get*"), false, context);
    expect(await codeOf(store.createPolicyVersion("Capped", allowDocument("studio:Get*"), false, context))).toBe("version_limit");
  });

  it("refuses bad names and invalid documents", async () => {
    const { store } = setup();
    expect(await codeOf(store.createPolicy("bad name", "identity", allowDocument("studio:Get*"), context))).toBe("invalid_name");
    expect(await codeOf(store.createPolicy("1Bad", "identity", allowDocument("studio:Get*"), context))).toBe("invalid_name");
    expect(await codeOf(store.createPolicy("Junk", "identity", { Version: "nope", Statement: [] }, context))).toBe("invalid_document");
    expect(await codeOf(store.createPolicy("AllowGuard", "guardrail", allowDocument("studio:Get*"), context))).toBe("invalid_document");
    await store.createPolicy("Once", "identity", allowDocument("studio:Get*"), context);
    expect(await codeOf(store.createPolicy("Once", "identity", allowDocument("studio:Get*"), context))).toBe("policy_exists");
    expect(await codeOf(store.createPolicyVersion("Once", { nope: true }, false, context))).toBe("invalid_document");
  });

  it("reserves predefined names: never created, versioned or deleted", async () => {
    const { store } = setup();
    expect(await codeOf(store.createPolicy("FluxIQUserAccess", "identity", allowDocument("studio:Get*"), context))).toBe("reserved_policy_name");
    expect(await codeOf(store.createPolicyVersion("FluxIQUserAccess", allowDocument("studio:Get*"), true, context))).toBe("reserved_policy_name");
    expect(await codeOf(store.setDefaultPolicyVersion("FluxIQUserAccess", "v1", context))).toBe("reserved_policy_name");
    expect(await codeOf(store.deletePolicy("FluxIQUserAccess", context))).toBe("reserved_policy_name");
  });

  it("refuses to delete a policy that is still attached", async () => {
    const { store } = setup();
    await store.createPolicy("InUse", "identity", allowDocument("studio:Get*"), context);
    const frn = store.principalFrn("user", "u1");
    await store.attachPolicy(frn, "InUse", context);
    expect(await codeOf(store.deletePolicy("InUse", context))).toBe("policy_attached");
    await store.detachPolicy(frn, "InUse", context);
    await store.deletePolicy("InUse", context);
    expect(await store.getPolicy("InUse")).toBeNull();
  });
});

describe("IamStore attachments", () => {
  it("attaches predefined and customer policies, refusing duplicates, unknowns, wrong kinds and the 21st", async () => {
    const { store } = setup();
    const frn = store.principalFrn("user", "u1");
    await store.attachPolicy(frn, "FluxIQUserAccess", context);
    expect(await codeOf(store.attachPolicy(frn, "FluxIQUserAccess", context))).toBe("already_attached");
    expect(await codeOf(store.attachPolicy(frn, "Missing", context))).toBe("policy_not_found");
    expect(await codeOf(store.attachPolicy(frn, "FluxIQServiceGuardrail", context))).toBe("policy_kind_mismatch");
    expect(await codeOf(store.attachPolicy("frn:fluxiq:iam:other:user/u1", "FluxIQUserAccess", context))).toBe("workspace_mismatch");
    expect(await codeOf(store.attachPolicy("not-an-frn", "FluxIQUserAccess", context))).toBe("invalid_principal");
    for (let index = 1; index < 20; index += 1) {
      await store.createPolicy(`P${index}`, "identity", allowDocument("studio:Get*"), context);
      await store.attachPolicy(frn, `P${index}`, context);
    }
    await store.createPolicy("Extra", "identity", allowDocument("studio:Get*"), context);
    expect(await codeOf(store.attachPolicy(frn, "Extra", context))).toBe("attachment_limit");
    expect(await store.listAttachedPolicies(frn)).toHaveLength(20);
  });

  it("requires a group, role or service identity to exist before it takes a policy", async () => {
    const { store } = setup();
    expect(await codeOf(store.attachPolicy(store.principalFrn("group", "ghost"), "FluxIQUserAccess", context))).toBe("not_found");
    expect(await codeOf(store.attachPolicy(store.principalFrn("role", "ghost"), "FluxIQUserAccess", context))).toBe("not_found");
    expect(await codeOf(store.attachPolicy(store.principalFrn("service-identity", "ghost"), "FluxIQUserAccess", context))).toBe("not_found");
  });
});

describe("IamStore resolution", () => {
  it("gathers direct, inline and group policies, and the guardrails", async () => {
    const { store } = setup();
    await store.createPolicy("Custom", "identity", allowDocument("secrets:Get*"), context);
    await store.createGroup("eng", context);
    await store.addUserToGroup("eng", "u1", context);
    await store.attachPolicy(store.principalFrn("group", "eng"), "Custom", context);
    await store.attachPolicy(store.principalFrn("user", "u1"), "FluxIQUserAccess", context);
    await store.putInlinePolicy(store.principalFrn("user", "u1"), "Mine", allowDocument("ops:Get*"), context);
    await store.attachGuardrail("FluxIQServiceGuardrail", context);
    const set = await store.resolvePolicySet(user(store, "u1"));
    expect(set.identity.map((policy) => policy.name)).toEqual(["FluxIQUserAccess", "inline:user/u1/Mine", "Custom"]);
    expect(set.guardrails.map((policy) => policy.name)).toEqual(["FluxIQServiceGuardrail"]);
    expect(set.sessions).toEqual([]);
    expect(set.boundary).toBeNull();
    const outsider = await store.resolvePolicySet(user(store, "u2"));
    expect(outsider.identity).toEqual([]);
  });

  it("uses the default version of a customer policy", async () => {
    const { store } = setup();
    await store.createPolicy("Versioned", "identity", allowDocument("studio:Get*"), context);
    await store.createPolicyVersion("Versioned", allowDocument("studio:List*"), true, context);
    await store.attachPolicy(store.principalFrn("user", "u1"), "Versioned", context);
    const set = await store.resolvePolicySet(user(store, "u1"));
    expect(set.identity[0]?.document.Statement[0]?.Action).toBe("studio:List*");
  });

  it("adds an assumed role's policies and takes the role's boundary, with session policies passed through", async () => {
    const { store } = setup();
    await store.createPolicy("Fence", "boundary", allowDocument("studio:*"), context);
    await store.createPolicy("UserFence", "boundary", allowDocument("secrets:*"), context);
    await store.createRole("deployer", TRUST, context, { boundary: "Fence" });
    await store.attachPolicy(store.principalFrn("role", "deployer"), "FluxIQUserAccess", context);
    await store.setPermissionBoundary(store.principalFrn("user", "u1"), "UserFence", context);
    const session: IamPolicy = { name: "Session", kind: "session", document: allowDocument("studio:Get*") as IamPolicy["document"] };
    const plain = await store.resolvePolicySet(user(store, "u1"));
    expect(plain.boundary?.name).toBe("UserFence");
    const assumed = await store.resolvePolicySet(user(store, "u1"), { assumedRole: "deployer", sessionPolicies: [session] });
    expect(assumed.identity.map((policy) => policy.name)).toEqual(["FluxIQUserAccess"]);
    expect(assumed.boundary?.name).toBe("Fence");
    expect(assumed.sessions).toEqual([session]);
    expect(await codeOf(store.resolvePolicySet(user(store, "u1"), { assumedRole: "ghost" }))).toBe("not_found");
  });

  it("resolves a service identity and refuses another workspace's principal", async () => {
    const { store } = setup();
    await store.createServiceIdentity("ci", context);
    await store.attachPolicy(store.principalFrn("service-identity", "ci"), "FluxIQUserAccess", context);
    const principal: IamPrincipal = { type: "service-identity", id: "ci", workspaceId: WORKSPACE, frn: store.principalFrn("service-identity", "ci") };
    expect((await store.resolvePolicySet(principal)).identity).toHaveLength(1);
    expect(await codeOf(store.resolvePolicySet({ ...principal, workspaceId: "w2" }))).toBe("workspace_mismatch");
  });

  it("throws on an attached name that no longer resolves, and on a wrong-kind resolution", async () => {
    const { repository, store } = setup();
    const frn = store.principalFrn("user", "u1");
    await store.attachPolicy(frn, "FluxIQUserAccess", context);
    const noPredefined = new IamStore({ workspaceId: WORKSPACE, repository, resolveManagedPolicy: () => null });
    expect(await codeOf(noPredefined.resolvePolicySet(user(store, "u1")))).toBe("unresolvable_policy");
    const wrongKind = new IamStore({
      workspaceId: WORKSPACE,
      repository,
      resolveManagedPolicy: (name) => (name === "FluxIQUserAccess" ? predefined.FluxIQServiceGuardrail ?? null : null)
    });
    expect(await codeOf(wrongKind.resolvePolicySet(user(store, "u1")))).toBe("policy_kind_mismatch");
  });

  it("keeps workspaces and the platform level apart in one repository", async () => {
    const { repository, store } = setup();
    await store.createGroup("eng", context);
    const platform = new IamStore({ workspaceId: null, repository, resolveManagedPolicy: () => null });
    expect(await platform.listGroups()).toEqual([]);
    await platform.createServiceIdentity("ops", context);
    expect((await platform.listServiceIdentities()).map((identity) => identity.name)).toEqual(["ops"]);
    expect(await store.listServiceIdentities()).toEqual([]);
  });
});

describe("IamStore groups, roles and cleanup", () => {
  it("validates ids and names, membership and roles", async () => {
    const { store } = setup();
    expect(await codeOf(store.createGroup("bad name", context))).toBe("invalid_name");
    expect(await codeOf(store.createRole("r1", allowDocument("studio:Get*"), context))).toBe("invalid_document");
    expect(await codeOf(store.createRole("r1", TRUST, context, { boundary: "Missing" }))).toBe("policy_not_found");
    await store.createGroup("eng", context);
    expect(await codeOf(store.createGroup("eng", context))).toBe("already_exists");
    expect(await codeOf(store.addUserToGroup("eng", "bad id", context))).toBe("invalid_name");
    await store.addUserToGroup("eng", "u1", context);
    expect(await codeOf(store.addUserToGroup("eng", "u1", context))).toBe("already_member");
    await store.removeUserFromGroup("eng", "u1", context);
    expect(await codeOf(store.removeUserFromGroup("eng", "u1", context))).toBe("not_member");
    await store.createRole("r1", TRUST, context);
    await store.updateAssumeRolePolicy("r1", TRUST, context);
    expect(await codeOf(store.updateAssumeRolePolicy("r1", { Version: VERSION, Statement: [] }, context))).toBe("invalid_document");
  });

  it("deleting a group or role removes its attachments, inline policies and boundary", async () => {
    const { repository, store } = setup();
    await store.createPolicy("Fence", "boundary", allowDocument("studio:*"), context);
    await store.createRole("r1", TRUST, context, { boundary: "Fence" });
    const frn = store.principalFrn("role", "r1");
    await store.attachPolicy(frn, "FluxIQUserAccess", context);
    await store.putInlinePolicy(frn, "Inline", allowDocument("ops:Get*"), context);
    await store.deleteRole("r1", context);
    expect(await store.listAttachedPolicies(frn)).toEqual([]);
    expect(await store.listInlinePolicies(frn)).toEqual([]);
    expect(await store.getPermissionBoundary(frn)).toBeNull();
    expect([...repository.rows.keys()].some((key) => key.includes("role"))).toBe(false);
    expect(await codeOf(store.deleteRole("r1", context))).toBe("not_found");
    await store.deletePolicy("Fence", context);
  });

  it("only a user or role takes a boundary, and it must be a boundary policy", async () => {
    const { store } = setup();
    await store.createServiceIdentity("ci", context);
    expect(await codeOf(store.setPermissionBoundary(store.principalFrn("service-identity", "ci"), "FluxIQUserAccess", context))).toBe("invalid_principal");
    expect(await codeOf(store.setPermissionBoundary(store.principalFrn("user", "u1"), "FluxIQUserAccess", context))).toBe("policy_kind_mismatch");
  });
});

describe("IamStore audit", () => {
  it("records an iam-change record per successful mutation and none for a refusal", async () => {
    const { sink, store } = setup();
    await store.createPolicy("Reader", "identity", allowDocument("studio:Get*"), { ...context, ipPrefix: "10.0.0.0/24" });
    await store.attachPolicy(store.principalFrn("user", "u1"), "Reader", context);
    await codeOf(store.attachPolicy(store.principalFrn("user", "u1"), "Reader", context));
    expect(sink.records).toHaveLength(2);
    expect(sink.records[0]).toMatchObject({
      category: "iam-change",
      time: 5,
      requestId: "req-1",
      principal: "frn:fluxiq:iam:w1:user/admin",
      action: "iam:CreatePolicy",
      resources: ["frn:fluxiq:iam:w1:policy/Reader"],
      decision: "allow",
      matched: { policy: "store", sid: null },
      origin: "panel",
      ipPrefix: "10.0.0.0/24"
    });
    expect(sink.records[1]).toMatchObject({
      action: "iam:AttachUserPolicy",
      resources: ["frn:fluxiq:iam:w1:user/u1", "frn:fluxiq:iam:w1:policy/Reader"],
      ipPrefix: null
    });
  });

  it("passes the caller's deciding statement through and names every mutation by its principal type", async () => {
    const { sink, store } = setup();
    await store.createGroup("eng", { ...context, matched: { policy: "FluxIQAdministratorAccess", sid: "All" } });
    await store.attachPolicy(store.principalFrn("group", "eng"), "FluxIQUserAccess", context);
    await store.addUserToGroup("eng", "u1", context);
    await store.createServiceIdentity("ci", context);
    await store.attachPolicy(store.principalFrn("service-identity", "ci"), "FluxIQUserAccess", context);
    expect(sink.records[0]?.matched).toEqual({ policy: "FluxIQAdministratorAccess", sid: "All" });
    expect(sink.records.map((record) => record.action)).toEqual([
      "iam:CreateGroup",
      "iam:AttachGroupPolicy",
      "iam:AddUserToGroup",
      "iam:CreateServiceIdentity",
      "iam:AttachServiceIdentityPolicy"
    ]);
  });

  it("works with no sink", async () => {
    const repository = new MemoryRepository();
    const store = new IamStore({ workspaceId: WORKSPACE, repository, resolveManagedPolicy: () => null });
    await store.createGroup("eng", context);
    expect((await store.listGroups()).map((group) => group.name)).toEqual(["eng"]);
  });
});
