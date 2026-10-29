import { describe, expect, it } from "vitest";
import { compileIamPolicySet, evaluateIamRequest } from "../../evaluate/index.ts";
import { iamPrincipalFrn, iamProgramFrn, iamWorkspaceFrn } from "../../frn/index.ts";
import type { IamDecision, IamPolicy, IamPolicySet, IamPrincipal, IamRequestContext, IamResource } from "../../types.ts";
import {
  IAM_ADMINISTRATOR_ACCESS,
  IAM_CONNECTED_SESSION,
  IAM_OWNER_FULL_ACCESS,
  IAM_PROVISIONER,
  IAM_READ_ONLY_ACCESS,
  IAM_SERVICE_GUARDRAIL,
  IAM_USER_ACCESS
} from "../index.ts";

const WS = "ws1";
const ALICE: IamPrincipal = { type: "user", id: "alice", workspaceId: WS, frn: iamPrincipalFrn("user", WS, "alice") };
const PROVISIONER: IamPrincipal = { type: "service-identity", id: "website", workspaceId: null, frn: iamPrincipalFrn("service-identity", null, "website") };
const CONTEXT: IamRequestContext = { workspaceId: WS, origin: "panel", currentTimeMs: Date.parse("2026-10-28T12:00:00Z"), profile: "service" };

const workspace: IamResource = { frn: iamWorkspaceFrn(WS) };
const ownProject: IamResource = { frn: `frn:fluxiq:studio:${WS}:project/p1`, ownerId: "alice" };
const othersProject: IamResource = { frn: `frn:fluxiq:studio:${WS}:project/p2`, ownerId: "bob" };
const unownedProject: IamResource = { frn: `frn:fluxiq:studio:${WS}:project/p3` };
const ownKey: IamResource = { frn: `frn:fluxiq:secrets:${WS}:key/k1`, ownerId: "alice" };
const ownBrowser: IamResource = { frn: `frn:fluxiq:gateway:${WS}:browser/b1`, ownerId: "alice" };
const otherWorkspaceProject: IamResource = { frn: "frn:fluxiq:studio:ws2:project/p1", ownerId: "alice" };
const program: IamResource = { frn: iamProgramFrn(WS, "database-manager") };
const account: IamResource = { frn: "frn:fluxiq:platform::account/acc1" };

function set(parts: Partial<IamPolicySet>): IamPolicySet {
  return { identity: parts.identity ?? [], guardrails: parts.guardrails ?? [], sessions: parts.sessions ?? [], boundary: parts.boundary ?? null };
}

function decide(principal: IamPrincipal, parts: Partial<IamPolicySet>, action: string, resource: IamResource): IamDecision {
  const compiled = compileIamPolicySet(set(parts), principal, principal.workspaceId);
  return evaluateIamRequest(compiled, principal, action, [resource], CONTEXT);
}

function outcome(decision: IamDecision): string {
  return `${decision.decision}:${decision.resources[0]?.reason ?? "none"}`;
}

const identity = (...policies: IamPolicy[]): Partial<IamPolicySet> => ({ identity: policies });

describe("FluxIQOwnerFullAccess", () => {
  it("takes the fast path in the workspace, its own FRN included, and reaches nothing outside", () => {
    expect(compileIamPolicySet(set(identity(IAM_OWNER_FULL_ACCESS)), ALICE, WS).fullAccess).toBe(true);
    expect(decide(ALICE, identity(IAM_OWNER_FULL_ACCESS), "studio:CreateProject", workspace).fullAccess).toBe(true);
    expect(decide(ALICE, identity(IAM_OWNER_FULL_ACCESS), "studio:GetFlow", othersProject).fullAccess).toBe(true);
    expect(decide(ALICE, identity(IAM_OWNER_FULL_ACCESS), "ops:Snapshot", program).fullAccess).toBe(true);
    expect(outcome(decide(ALICE, identity(IAM_OWNER_FULL_ACCESS), "studio:GetFlow", otherWorkspaceProject))).toBe("deny:implicit-deny");
    expect(outcome(decide(ALICE, identity(IAM_OWNER_FULL_ACCESS), "platform:CreateAccount", account))).toBe("deny:implicit-deny");
  });
});

describe("FluxIQAdministratorAccess", () => {
  it("reaches every workspace service, but not platform or another workspace", () => {
    for (const [action, resource] of [["iam:CreateUser", workspace], ["secrets:RevealKey", workspace], ["ops:RunMigration", program], ["studio:DeleteProject", othersProject]] as const) {
      expect(outcome(decide(ALICE, identity(IAM_ADMINISTRATOR_ACCESS), action, resource)), action).toBe("allow:allowed");
    }
    expect(outcome(decide(ALICE, identity(IAM_ADMINISTRATOR_ACCESS), "platform:CreateAccount", account))).toBe("deny:implicit-deny");
    expect(outcome(decide(ALICE, identity(IAM_ADMINISTRATOR_ACCESS), "studio:GetFlow", otherWorkspaceProject))).toBe("deny:implicit-deny");
    expect(decide(ALICE, identity(IAM_ADMINISTRATOR_ACCESS), "studio:GetFlow", ownProject).fullAccess).toBe(true);
    expect(outcome(decide(ALICE, identity(IAM_ADMINISTRATOR_ACCESS), "platform:DeleteWorkspace", workspace))).toBe("deny:implicit-deny");
  });
});

describe("FluxIQReadOnlyAccess", () => {
  it("allows a generated read-only action and nothing that writes", () => {
    expect(outcome(decide(ALICE, identity(IAM_READ_ONLY_ACCESS), "studio:GetFlow", workspace))).toBe("allow:allowed");
    expect(outcome(decide(ALICE, identity(IAM_READ_ONLY_ACCESS), "ops:Snapshot", program))).toBe("allow:allowed");
    expect(outcome(decide(ALICE, identity(IAM_READ_ONLY_ACCESS), "studio:CreateProject", workspace))).toBe("deny:implicit-deny");
    expect(outcome(decide(ALICE, identity(IAM_READ_ONLY_ACCESS), "secrets:RevealKey", workspace))).toBe("deny:implicit-deny");
  });
});

describe("FluxIQUserAccess", () => {
  const user = identity(IAM_USER_ACCESS);

  it("reaches what the caller owns and nothing else", () => {
    expect(outcome(decide(ALICE, user, "studio:GetFlow", ownProject))).toBe("allow:allowed");
    expect(outcome(decide(ALICE, user, "studio:DeleteProject", ownProject))).toBe("allow:allowed");
    expect(outcome(decide(ALICE, user, "secrets:RevealKey", ownKey))).toBe("allow:allowed");
    expect(outcome(decide(ALICE, user, "gateway:Connect", ownBrowser))).toBe("allow:allowed");
    expect(outcome(decide(ALICE, user, "studio:GetFlow", othersProject))).toBe("deny:implicit-deny");
    expect(outcome(decide(ALICE, user, "studio:GetFlow", unownedProject))).toBe("deny:implicit-deny");
    expect(outcome(decide(ALICE, user, "studio:GetFlow", otherWorkspaceProject))).toBe("deny:implicit-deny");
  });

  it("creates and lists on the workspace FRN, and reads nothing else there", () => {
    expect(outcome(decide(ALICE, user, "studio:CreateProject", workspace))).toBe("allow:allowed");
    expect(outcome(decide(ALICE, user, "studio:ListFlows", workspace))).toBe("allow:allowed");
    expect(outcome(decide(ALICE, user, "secrets:CreateKey", workspace))).toBe("allow:allowed");
    expect(outcome(decide(ALICE, user, "studio:GetFlow", workspace))).toBe("deny:implicit-deny");
    expect(outcome(decide(ALICE, user, "studio:Snapshot", workspace))).toBe("deny:implicit-deny");
  });

  it("manages only the caller's own credentials, and no operator program", () => {
    expect(outcome(decide(ALICE, user, "iam:SetPassword", { frn: iamPrincipalFrn("user", WS, "alice") }))).toBe("allow:allowed");
    expect(outcome(decide(ALICE, user, "iam:SetPassword", { frn: iamPrincipalFrn("user", WS, "bob") }))).toBe("deny:implicit-deny");
    expect(outcome(decide(ALICE, user, "iam:CreateUser", workspace))).toBe("deny:implicit-deny");
    expect(outcome(decide(ALICE, user, "iam:UpdateUser", { frn: iamPrincipalFrn("user", WS, "alice") }))).toBe("deny:implicit-deny");
    expect(outcome(decide(ALICE, user, "ops:Snapshot", program))).toBe("deny:implicit-deny");
  });
});

describe("FluxIQBrowserSession", () => {
  const session: Partial<IamPolicySet> = { identity: [IAM_USER_ACCESS], sessions: [IAM_CONNECTED_SESSION] };
  const ownerSession: Partial<IamPolicySet> = { identity: [IAM_OWNER_FULL_ACCESS], sessions: [IAM_CONNECTED_SESSION] };

  it("narrows its user to Studio and gateway, never iam, key reveal or destruction", () => {
    expect(outcome(decide(ALICE, session, "studio:GetFlow", ownProject))).toBe("allow:allowed");
    expect(outcome(decide(ALICE, session, "gateway:Connect", ownBrowser))).toBe("allow:allowed");
    expect(outcome(decide(ALICE, session, "studio:GetFlow", othersProject))).toBe("deny:implicit-deny");
    expect(outcome(decide(ALICE, session, "studio:DeleteProject", ownProject))).toBe("deny:explicit-deny");
    expect(outcome(decide(ALICE, session, "secrets:RevealKey", ownKey))).toBe("deny:explicit-deny");
    expect(outcome(decide(ALICE, session, "secrets:CreateKey", workspace))).toBe("deny:implicit-deny");
    expect(outcome(decide(ALICE, session, "iam:SetPassword", { frn: iamPrincipalFrn("user", WS, "alice") }))).toBe("deny:explicit-deny");
  });

  it("narrows an owner too, and turns the fast path off", () => {
    expect(compileIamPolicySet(set(ownerSession), ALICE, WS).fullAccess).toBe(false);
    expect(outcome(decide(ALICE, ownerSession, "studio:GetFlow", othersProject))).toBe("allow:allowed");
    expect(outcome(decide(ALICE, ownerSession, "ops:Snapshot", program))).toBe("deny:implicit-deny");
    expect(outcome(decide(ALICE, ownerSession, "studio:DeleteRecording", othersProject))).toBe("deny:explicit-deny");
  });
});

describe("FluxIQProvisioner", () => {
  it("reaches account FRNs only, and is refused all workspace content explicitly", () => {
    expect(outcome(decide(PROVISIONER, identity(IAM_PROVISIONER), "platform:CreateAccount", account))).toBe("allow:allowed");
    expect(outcome(decide(PROVISIONER, identity(IAM_PROVISIONER), "platform:SetAccountPolicies", account))).toBe("allow:allowed");
    expect(outcome(decide(PROVISIONER, identity(IAM_PROVISIONER), "platform:CreateWorkspace", workspace))).toBe("deny:explicit-deny");
    expect(outcome(decide(PROVISIONER, identity(IAM_PROVISIONER), "studio:GetFlow", ownProject))).toBe("deny:explicit-deny");
    expect(outcome(decide(PROVISIONER, identity(IAM_PROVISIONER), "iam:CreateUser", { frn: iamPrincipalFrn("user", WS, "alice") }))).toBe("deny:explicit-deny");
    expect(outcome(decide(PROVISIONER, identity(IAM_PROVISIONER), "ops:Snapshot", program))).toBe("deny:explicit-deny");
    // A platform-level FRN is not workspace content: no grant, but no explicit deny either.
    expect(outcome(decide(PROVISIONER, identity(IAM_PROVISIONER), "iam:GetPolicy", { frn: "frn:fluxiq:iam::policy/P1" }))).toBe("deny:implicit-deny");
    expect(outcome(decide(PROVISIONER, identity(IAM_PROVISIONER), "ops:Snapshot", { frn: iamProgramFrn(null, "docs") }))).toBe("deny:implicit-deny");
  });

  it("keeps workspace content denied when combined with an owner grant", () => {
    expect(outcome(decide(ALICE, identity(IAM_OWNER_FULL_ACCESS, IAM_PROVISIONER), "studio:GetFlow", ownProject))).toBe("deny:explicit-deny");
  });
});

describe("FluxIQServiceGuardrail", () => {
  it("denies operator programs and platform actions over any identity grant, and nothing else", () => {
    const guarded: Partial<IamPolicySet> = { identity: [IAM_OWNER_FULL_ACCESS], guardrails: [IAM_SERVICE_GUARDRAIL] };
    expect(compileIamPolicySet(set(guarded), ALICE, WS).fullAccess).toBe(false);
    expect(outcome(decide(ALICE, guarded, "ops:RunMigration", program))).toBe("deny:explicit-deny");
    expect(outcome(decide(ALICE, guarded, "ops:Snapshot", program))).toBe("deny:explicit-deny");
    expect(outcome(decide(ALICE, guarded, "platform:CreateAccount", account))).toBe("deny:explicit-deny");
    expect(outcome(decide(ALICE, guarded, "studio:GetFlow", othersProject))).toBe("allow:allowed");
    expect(outcome(decide(ALICE, guarded, "studio:MigrateFlows", workspace))).toBe("allow:allowed");
  });
});
