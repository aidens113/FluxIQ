// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SQLiteRepository } from "../../../../programs/database-manager/index.ts";
import type { IamPrincipal } from "../../types.ts";
import { IamStore } from "../iam-store.ts";

// The IAM store over a real SQLiteRepository, which stamps its own kind
// ("platform.iam") on every row and lower-cases the workspace in the scope it
// returns. Every record kind the store writes (policy with its versions,
// attachments, inline, boundary, guardrails, group, role, service identity) is
// written, then read back through a second repository over the same files, as
// after a restart. A workspace id with capitals proves the scope is not
// compared on the way back; a second workspace and the platform level prove
// the rows stay apart.

const VERSION = "2026-10-30";
const WORKSPACE = "Workspace-A";
const TRUST = { Version: VERSION, Statement: [{ Effect: "Allow", Principal: { FluxIQ: "*" }, Action: "iam:AssumeRole" }] };
const context = { actor: "frn:fluxiq:iam:Workspace-A:user/admin", origin: "panel", requestId: "req-sqlite" } as const;

function document(effect: "Allow" | "Deny", action: string): unknown {
  return { Version: VERSION, Statement: [{ Effect: effect, Action: action, Resource: "*" }] };
}

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function openStore(rootDir: string, workspaceId: string | null): IamStore {
  return new IamStore({ workspaceId, repository: new SQLiteRepository({ rootDir, kind: "platform.iam", layoutVersion: 2 }), resolveManagedPolicy: () => null, now: () => 5000 });
}

function user(store: IamStore, id: string): IamPrincipal {
  return { type: "user", id, workspaceId: WORKSPACE, frn: store.principalFrn("user", id) };
}

describe("IamStore over SQLite", () => {
  it("writes and reads back every record kind across a reopen, kept apart by workspace", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-iam-sqlite-"));
    directories.push(rootDir);
    const writer = openStore(rootDir, WORKSPACE);
    const member = writer.principalFrn("user", "u1");
    await writer.createPolicy("Reader", "identity", document("Allow", "studio:Get*"), context);
    await writer.createPolicyVersion("Reader", document("Allow", "studio:List*"), true, context);
    await writer.createPolicy("Fence", "boundary", document("Allow", "studio:*"), context);
    await writer.createPolicy("NoDeletes", "guardrail", document("Deny", "iam:Delete*"), context);
    await writer.attachPolicy(member, "Reader", context);
    await writer.putInlinePolicy(member, "Mine", document("Allow", "ops:Get*"), context);
    await writer.setPermissionBoundary(member, "Fence", context);
    await writer.attachGuardrail("NoDeletes", context);
    await writer.createGroup("eng", context);
    await writer.addUserToGroup("eng", "u1", context);
    await writer.createRole("deployer", TRUST, context, { boundary: "Fence" });
    await writer.createServiceIdentity("ci", context);

    const reader = openStore(rootDir, WORKSPACE);
    expect((await reader.getPolicy("Reader"))?.versions.map((version) => version.id)).toEqual(["v1", "v2"]);
    expect((await reader.getPolicy("Reader"))?.defaultVersionId).toBe("v2");
    expect((await reader.listPolicies()).map((policy) => policy.name).sort()).toEqual(["Fence", "NoDeletes", "Reader"]);
    expect(await reader.listAttachedPolicies(member)).toEqual(["Reader"]);
    expect((await reader.listInlinePolicies(member)).map((policy) => policy.name)).toEqual(["Mine"]);
    expect(await reader.getPermissionBoundary(member)).toBe("Fence");
    expect(await reader.listGuardrails()).toEqual(["NoDeletes"]);
    expect((await reader.getGroup("eng"))?.members).toEqual(["u1"]);
    expect((await reader.listGroups()).map((group) => group.name)).toEqual(["eng"]);
    expect((await reader.getRole("deployer"))?.name).toBe("deployer");
    expect((await reader.listRoles()).map((role) => role.name)).toEqual(["deployer"]);
    expect(await reader.getPermissionBoundary(reader.principalFrn("role", "deployer"))).toBe("Fence");
    expect((await reader.getServiceIdentity("ci"))?.name).toBe("ci");
    expect((await reader.listServiceIdentities()).map((identity) => identity.name)).toEqual(["ci"]);

    const set = await reader.resolvePolicySet(user(reader, "u1"));
    expect(set.identity.map((policy) => policy.name)).toEqual(["Reader", "inline:user/u1/Mine"]);
    expect(set.identity[0]?.document.Statement[0]?.Action).toBe("studio:List*");
    expect(set.guardrails.map((policy) => policy.name)).toEqual(["NoDeletes"]);
    expect(set.boundary?.name).toBe("Fence");

    for (const other of [openStore(rootDir, "workspace-b"), openStore(rootDir, null)]) {
      expect(await other.listPolicies()).toEqual([]);
      expect(await other.getPolicy("Reader")).toBeNull();
      expect(await other.listGroups()).toEqual([]);
      expect(await other.listRoles()).toEqual([]);
      expect(await other.listServiceIdentities()).toEqual([]);
      expect(await other.listGuardrails()).toEqual([]);
    }

    await reader.deleteServiceIdentity("ci", context);
    await reader.deleteGroup("eng", context);
    expect(await openStore(rootDir, WORKSPACE).listServiceIdentities()).toEqual([]);
    expect(await openStore(rootDir, WORKSPACE).getGroup("eng")).toBeNull();
  });
});
