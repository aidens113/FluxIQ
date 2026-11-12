// A list a caller can only partly see writes one audit row for the request,
// carrying how many items it hid, never one row per hidden item; visibility is
// still decided item by item. Driven through the real registry, so the rows
// are the ones `filterProgramList` produces on a live call.

import { describe, expect, it } from "vitest";
import { IamDecisionAuditFilter } from "../../../../platform/iam/audit/index.ts";
import { IAM_OWNER_FULL_ACCESS, IAM_USER_ACCESS } from "../../../../platform/iam/predefined/index.ts";
import type { IamAuditRecord } from "../../../../platform/iam/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiRegistrationParams } from "../../api.ts";
import { actor, ADMIN_PERMISSIONS, fixedPolicySource, pinAcceptingIdentityAccess, recordingSink, registerPrefixOwners, VIEWER_PERMISSIONS } from "../../tests/iam-registry-fixtures.ts";
import { endpointResource, type ProgramApiIamOptions } from "../index.ts";

const WORKSPACE = "frn:fluxiq:platform::workspace/workspace-main";
const LIST = "studio:Projects";
const ITEMS = [{ id: "a-1" }, { id: "b-1" }, { id: "x-1" }, { id: "a-2" }, { id: "b-2" }, {}];

const projects: ProgramApiRegistrationParams = {
  programId: "automation-studio",
  endpoint: "projects",
  permission: "programs.read",
  classification: "read",
  action: LIST,
  accessLevel: "Read",
  resource: endpointResource.workspace(),
  list: {
    items: (payload) => (payload as { projects: unknown[] }).projects,
    ref: (item) => ({ kind: "project", projectId: (item as { id: unknown }).id }),
    replace: (payload, kept) => ({ ...(payload as object), projects: kept })
  },
  handler: () => ({ ok: true, payload: { projects: ITEMS, total: ITEMS.length } })
};

function listed(iam: ProgramApiIamOptions) {
  const built = new GlobalProgramApiRegistry({ identityAccess: pinAcceptingIdentityAccess, iam });
  built.register(projects);
  registerPrefixOwners(built);
  return (userId: string, roleId = "user", permissions = ADMIN_PERMISSIONS) =>
    built.call({ programId: "automation-studio", endpoint: "projects", scope: {}, actor: actor(userId, roleId, permissions), payload: {} });
}

const summary = (records: readonly IamAuditRecord[]) => records.map((record) => `${record.category} ${record.action} ${record.resources.join(",")} ${record.hidden ?? "-"}`);

describe("filterProgramList audits a list once", () => {
  it("service: shows a user only their items and writes one deny row carrying how many were hidden", async () => {
    const audit = recordingSink();
    const call = listed({ profile: "service", source: fixedPolicySource([IAM_USER_ACCESS]), audit });
    await expect(call("bob")).resolves.toEqual({ ok: true, payload: { projects: [{ id: "b-1" }, { id: "b-2" }], total: ITEMS.length } });
    expect(summary(audit.records)).toEqual([`allow ${LIST} ${WORKSPACE} -`, `deny ${LIST} ${WORKSPACE} 4`]);
    expect(new Set(audit.records.map((record) => record.requestId)).size).toBe(1);
    expect(JSON.stringify(audit.records)).not.toMatch(/project\/(a|b|x)-/u);
  });

  it("service: behind the decision filter, persists only that one row; a list that hides nothing persists none", async () => {
    const persisted = recordingSink();
    const audit = new IamDecisionAuditFilter(persisted, (action) => action === LIST);
    await expect(listed({ profile: "service", source: fixedPolicySource([IAM_USER_ACCESS]), audit })("alice")).resolves.toMatchObject({ payload: { projects: [{ id: "a-1" }, { id: "a-2" }] } });
    expect(summary(persisted.records)).toEqual([`deny ${LIST} ${WORKSPACE} 4`]);

    persisted.records.length = 0;
    // The guardrail's `Deny` keeps the owner off the full-access fast path, so this list is decided item by item.
    await expect(listed({ profile: "service", source: fixedPolicySource([IAM_OWNER_FULL_ACCESS]), audit })("alice")).resolves.toMatchObject({ payload: { projects: ITEMS } });
    expect(persisted.records).toEqual([]);
  });

  for (const profile of ["local", "self-hosted"] as const) {
    it(`${profile}: a viewer sees every item, decided item by item, with one allow row and no count`, async () => {
      const audit = recordingSink();
      await expect(listed({ profile, audit })("viewer.one", "viewer", VIEWER_PERMISSIONS)).resolves.toEqual({ ok: true, payload: { projects: ITEMS, total: ITEMS.length } });
      expect(summary(audit.records)).toEqual([`allow ${LIST} ${WORKSPACE} -`, `allow ${LIST} ${WORKSPACE} -`]);
    });
  }
});
