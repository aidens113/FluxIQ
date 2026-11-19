import { describe, expect, it } from "vitest";
import { compileIamPolicySet, evaluateIamRequest } from "../../evaluate/index.ts";
import { iamPrincipalFrn, iamWorkspaceFrn } from "../../frn/index.ts";
import type { IamPolicySet, IamPrincipal, IamRequestContext, IamResource } from "../../types.ts";
import { IAM_ADMINISTRATOR_ACCESS, IAM_OWNER_FULL_ACCESS, IAM_SERVICE_GUARDRAIL, IAM_USER_ACCESS } from "../index.ts";

// FluxIQServiceGuardrail v2: on the hosted service, Identity Access's local
// member administration is denied over any grant (its people could never sign
// in), and a person's own sign-in security is left to their policies.

const WS = "ws1";
const ALICE: IamPrincipal = { type: "user", id: "alice", workspaceId: WS, frn: iamPrincipalFrn("user", WS, "alice") };
const CONTEXT: IamRequestContext = { workspaceId: WS, origin: "panel", currentTimeMs: Date.parse("2026-11-18T12:00:00Z"), profile: "service" };
const workspace: IamResource = { frn: iamWorkspaceFrn(WS) };
const ownUser: IamResource = { frn: `frn:fluxiq:iam:${WS}:user/alice`, ownerId: "alice" };

const LOCAL_ADMINISTRATION = ["iam:CreateUser", "iam:UpdateUser", "iam:SetPassword", "iam:SetPin", "iam:CreateSession", "iam:UnlockVault"];
const SELF_SERVICE = ["iam:BeginTotp", "iam:ConfirmTotp", "iam:DisableTotp", "iam:GetMyPreferences", "iam:UpdateMyPreferences", "iam:RecaseMyUsername", "iam:RevokeSession"];

function outcome(identity: IamPolicySet["identity"], action: string, resource: IamResource, guarded = true): string {
  const compiled = compileIamPolicySet({ identity, guardrails: guarded ? [IAM_SERVICE_GUARDRAIL] : [], sessions: [], boundary: null }, ALICE, WS);
  const decision = evaluateIamRequest(compiled, ALICE, action, [resource], CONTEXT);
  return `${decision.decision}:${decision.resources[0]?.reason ?? "none"}`;
}

describe("FluxIQServiceGuardrail v2", () => {
  it("is version v2 with the local identity administration statement", () => {
    expect(IAM_SERVICE_GUARDRAIL.version).toBe("v2");
    const statement = IAM_SERVICE_GUARDRAIL.document.Statement.find((candidate) => candidate.Sid === "DenyLocalIdentityAdministration");
    expect(statement).toMatchObject({ Effect: "Deny", Resource: "*" });
    expect([...(statement?.Action as string[])].sort()).toEqual([...LOCAL_ADMINISTRATION].sort());
  });

  it("denies local member administration over the owner's and an administrator's grants, on any resource", () => {
    for (const identity of [[IAM_OWNER_FULL_ACCESS], [IAM_ADMINISTRATOR_ACCESS]]) {
      for (const action of LOCAL_ADMINISTRATION) {
        expect(outcome(identity, action, workspace), action).toBe("deny:explicit-deny");
        expect(outcome(identity, action, ownUser), action).toBe("deny:explicit-deny");
        // Without the guardrail (local and self-hosted) the same grant allows it.
        expect(outcome(identity, action, workspace, false), action).not.toMatch(/^deny/u);
      }
    }
  });

  it("leaves a person's own sign-in security to their policies", () => {
    for (const action of SELF_SERVICE) {
      expect(outcome([IAM_ADMINISTRATOR_ACCESS], action, ownUser), action).toBe("allow:allowed");
      expect(outcome([IAM_USER_ACCESS], action, ownUser), action).toBe("allow:allowed");
    }
    expect(outcome([IAM_ADMINISTRATOR_ACCESS], "iam:Snapshot", workspace)).toBe("allow:allowed");
  });
});
