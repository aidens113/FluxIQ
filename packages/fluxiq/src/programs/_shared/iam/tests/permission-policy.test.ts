import { describe, expect, it } from "vitest";
import { compileIamPolicySet, evaluateIamRequest } from "../../../../platform/iam/evaluate/index.ts";
import { iamPrincipalFrn, iamProgramFrn, iamWorkspaceFrn } from "../../../../platform/iam/frn/index.ts";
import type { IamPolicy, IamPrincipal } from "../../../../platform/iam/index.ts";
import { programPermissionPolicy, type ProgramPermissionGrant } from "../permission-policy.ts";

const WS = "ws-1";
const ALICE: IamPrincipal = { type: "user", id: "alice", workspaceId: WS, frn: iamPrincipalFrn("user", WS, "alice") };
const context = { workspaceId: WS, origin: "panel" as const, currentTimeMs: 0 };

function decide(policy: IamPolicy, action: string, frn: string): string {
  const compiled = compileIamPolicySet({ identity: [policy], guardrails: [], sessions: [], boundary: null }, ALICE, WS);
  return evaluateIamRequest(compiled, ALICE, action, [{ frn }], context).decision;
}

describe("programPermissionPolicy", () => {
  const grants: ProgramPermissionGrant[] = [
    { action: "studio:GetFlow", programId: "automation-studio", held: true },
    { action: "studio:SaveFlow", programId: "automation-studio", held: false },
    { action: "ops:Snapshot", programId: "database-manager", held: true },
    { action: "ops:Snapshot", programId: "compute-control", held: false },
    { action: "ops:Status", programId: "runtime", held: true },
    { action: "ops:Status", programId: "docs", held: true }
  ];
  const policy = programPermissionPolicy("FluxIQPermissions", "identity", grants, false);

  it("allows held actions in the workspace, and a partly held shared action only on its programs", () => {
    expect(decide(policy, "studio:GetFlow", "frn:fluxiq:studio:ws-1:project/p1")).toBe("allow");
    expect(decide(policy, "studio:GetFlow", iamWorkspaceFrn(WS))).toBe("allow");
    expect(decide(policy, "studio:SaveFlow", "frn:fluxiq:studio:ws-1:project/p1")).toBe("deny");
    expect(decide(policy, "ops:Snapshot", iamProgramFrn(WS, "database-manager"))).toBe("allow");
    expect(decide(policy, "ops:Snapshot", iamProgramFrn(WS, "compute-control"))).toBe("deny");
    expect(decide(policy, "ops:Status", iamProgramFrn(WS, "docs"))).toBe("allow");
    expect(decide(policy, "studio:GetFlow", "frn:fluxiq:studio:other:project/p1")).toBe("deny");
  });

  it("is a full-access grant for an actor holding every permission, and a deny for one holding none", () => {
    const everything = programPermissionPolicy("FluxIQPermissionSession", "session", grants, true);
    expect(compileIamPolicySet({ identity: [everything], guardrails: [], sessions: [everything], boundary: null }, ALICE, WS).fullAccess).toBe(true);
    const nothing = programPermissionPolicy("FluxIQPermissions", "identity", grants.map((grant) => ({ ...grant, held: false })), false);
    expect(nothing.document.Statement).toEqual([{ Sid: "PermissionNone", Effect: "Deny", Action: "*", Resource: "*" }]);
    expect(decide(nothing, "studio:GetFlow", iamWorkspaceFrn(WS))).toBe("deny");
  });
});
