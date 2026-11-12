// The assistant's spending allowance is one value for the whole workspace, so
// IAM decides reading and changing it on the workspace, never on the caller's
// own user:
//
// - a grant on the person's own user does not reach it; a grant on the
//   workspace does;
// - the `local` profile decides by permission, as before: `secrets.manage`
//   changes it, `programs.read` reads it;
// - under `service`, the predefined policies: owner and administrator change
//   it, read-only access reads it and cannot change it, and user access (a
//   member) reads it, through `IAM_USER_WORKSPACE_SETTING_READS` on the
//   workspace, and cannot change it.

import { IAM_POLICY_LANGUAGE_VERSION, parseIamPolicyDocument } from "@fluxiq/contracts/iam";
import { describe, expect, it } from "vitest";
import type { IamPolicy } from "../../../../../platform/iam/index.ts";
import { IAM_ADMINISTRATOR_ACCESS, IAM_OWNER_FULL_ACCESS, IAM_READ_ONLY_ACCESS, IAM_USER_ACCESS } from "../../../../../platform/iam/predefined/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../_shared/api.ts";
import { ADMIN_PERMISSIONS, actor, fixedPolicySource, outcomeOf, VIEWER_PERMISSIONS } from "../../../../_shared/tests/iam-registry-fixtures.ts";
import { PANEL_ASSISTANT_ENDPOINTS } from "../endpoints.ts";
import { panelAssistantOf } from "../panel-assistant-of.ts";
import { registerPanelAssistantEndpoints } from "../register.ts";

const ALLOWANCE_ACTIONS = ["studio:GetPanelAssistantAllowance", "studio:SetPanelAssistantAllowance"];

async function unused(): Promise<never> {
  throw new Error("Not read in these cases.");
}

/** An identity policy allowing both allowance actions on `resource`. */
function allowanceOn(name: string, resource: string): IamPolicy {
  const parsed = parseIamPolicyDocument({ Version: IAM_POLICY_LANGUAGE_VERSION, Statement: [{ Sid: name, Effect: "Allow", Action: ALLOWANCE_ACTIONS, Resource: resource }] }, "identity");
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return { name, kind: "identity", document: parsed.data };
}

const OWN_USER = "frn:fluxiq:iam:${fluxiq:WorkspaceId}:user/${fluxiq:PrincipalId}";
const WORKSPACE = "frn:fluxiq:platform::workspace/${fluxiq:WorkspaceId}";

/** A registry with the panel endpoints and an in-memory allowance, decided by `policies` under `service` or by permission under `local`. No thread is opened, so no data root is given. */
function world(policies?: readonly IamPolicy[]) {
  const registry = new GlobalProgramApiRegistry(policies ? { iam: { profile: "service", source: fixedPolicySource(policies) } } : {});
  registerPanelAssistantEndpoints({ registry, service: { projectPaths: { root: undefined }, getFlowBootstrapAdaptation: unused, getFlow: unused, assertProjectDomainAccess: unused } });
  let kept: number | undefined;
  panelAssistantOf(registry)!.bindSettings({
    allowanceUsd: async () => kept,
    setAllowanceUsd: async (usd) => (kept = usd)
  });
  const call = (endpoint: string, caller: ProgramApiActor, payload: Record<string, unknown> = {}) => registry.call({ programId: "automation-studio", endpoint, scope: {}, actor: caller, payload });
  const decide = async (caller: ProgramApiActor) => ({
    read: outcomeOf(await call(PANEL_ASSISTANT_ENDPOINTS.getAllowance, caller)),
    change: outcomeOf(await call(PANEL_ASSISTANT_ENDPOINTS.setAllowance, caller, { allowanceUsd: 2 }))
  });
  return { call, decide, allowance: () => kept };
}

const person = actor("alice", "user", ["programs.read", "programs.write", "secrets.manage"]);

describe("the panel assistant's spending allowance is decided on the workspace", () => {
  it("is not reached by a grant on the caller's own user, and is by a grant on the workspace", async () => {
    const own = world([allowanceOn("OwnUserAllowance", OWN_USER)]);
    expect(await own.decide(person)).toEqual({ read: "deny", change: "deny" });
    expect(own.allowance()).toBeUndefined();

    const workspace = world([allowanceOn("WorkspaceAllowance", WORKSPACE)]);
    expect(await workspace.decide(person)).toEqual({ read: "allow", change: "allow" });
    expect(workspace.allowance()).toBe(2);
    expect(await workspace.call(PANEL_ASSISTANT_ENDPOINTS.getAllowance, person)).toMatchObject({ ok: true, payload: { allowanceUsd: 2, chosen: true } });
  });

  it("under local, decides by permission: secrets.manage changes it, programs.read reads it", async () => {
    const { decide } = world();
    expect(await decide(actor("admin", "admin", ADMIN_PERMISSIONS))).toEqual({ read: "allow", change: "allow" });
    expect(await decide(actor("viewer", "viewer", VIEWER_PERMISSIONS))).toEqual({ read: "allow", change: "deny" });
    expect(await decide(actor("writer", "user", ["programs.read", "programs.write"]))).toEqual({ read: "allow", change: "deny" });
  });

  it("under service, owner and administrator change it, read-only and user access read it and cannot change it", async () => {
    expect(await world([IAM_OWNER_FULL_ACCESS]).decide(person)).toEqual({ read: "allow", change: "allow" });
    expect(await world([IAM_ADMINISTRATOR_ACCESS]).decide(person)).toEqual({ read: "allow", change: "allow" });
    expect(await world([IAM_READ_ONLY_ACCESS]).decide(person)).toEqual({ read: "allow", change: "deny" });
    // A member reads the workspace's allowance (IAM_USER_WORKSPACE_SETTING_READS) and never changes it.
    const member = world([IAM_USER_ACCESS]);
    expect(await member.decide(person)).toEqual({ read: "allow", change: "deny" });
    expect(member.allowance()).toBeUndefined();
  });
});
