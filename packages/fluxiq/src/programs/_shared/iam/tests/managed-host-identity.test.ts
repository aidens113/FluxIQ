import { describe, expect, it } from "vitest";
import { IAM_POLICY_LANGUAGE_VERSION, type IamPolicyDocument } from "@fluxiq/contracts/iam";
import type { IamPolicySet } from "../../../../platform/iam/index.ts";
import type { ProgramApiActor } from "../../api.ts";
import { ProgramIamGate } from "../program-iam-gate.ts";

const resource = (project: string): string => `frn:fluxiq:studio:ws:project/${project}`;
const policy = (project: string): IamPolicyDocument => ({ Version: IAM_POLICY_LANGUAGE_VERSION, Statement: [{ Effect: "Allow", Action: "studio:GetRecordingCapturePolicy", Resource: resource(project) }] });
const machine = (project: string): ProgramApiActor => ({ sessionId: "gateway:one", userId: "managed:one", roleId: "admin", permissions: ["identity.manage", "programs.write", "programs.read"], serviceIdentity: { id: "managed:one", policy: policy(project) } });
const empty = (): IamPolicySet => ({ identity: [], guardrails: [], sessions: [], boundary: null });

describe("managed host IAM identity", () => {
  it("uses a service principal and only its current lease policy, never the supplied person's role", async () => {
    const gate = new ProgramIamGate({ workspaceId: "ws" }, () => [], new Map());
    const opened = await gate.open(machine("p1"));
    const decide = (action: string, project: string) => opened.authorizer.decide(action, [{ frn: resource(project) }]);
    expect(decide("studio:GetRecordingCapturePolicy", "p1")).toMatchObject({ decision: "allow", principal: "frn:fluxiq:iam:ws:service-identity/~6d616e616765643a6f6e65" });
    expect(decide("studio:GetRecordingCapturePolicy", "p2").decision).toBe("deny");
    expect(decide("studio:SaveFlow", "p1").decision).toBe("deny");
    expect(opened.compiled.fullAccess).toBe(false);
  });

  it("never reuses a machine's policy from its previous project's lease", async () => {
    const gate = new ProgramIamGate({ workspaceId: "ws" }, () => [], new Map());
    await gate.open(machine("p1"));
    const next = await gate.open(machine("p2"));
    expect(next.authorizer.decide("studio:GetRecordingCapturePolicy", [{ frn: resource("p1") }]).decision).toBe("deny");
    expect(next.authorizer.decide("studio:GetRecordingCapturePolicy", [{ frn: resource("p2") }]).decision).toBe("allow");
  });

  for (const profile of ["local", "self-hosted", "service"] as const) {
    it(`respects source guardrail revocation and failures under ${profile}`, async () => {
      let revoked = false;
      let broken = false;
      const gate = new ProgramIamGate({ workspaceId: "ws", profile, source: { getRole: async () => null, resolvePolicySet: async (principal) => {
        expect(principal.type).toBe("service-identity");
        if (broken) throw new Error("store unavailable");
        return { ...empty(), guardrails: revoked ? [{ name: "RevokedHost", kind: "guardrail", document: { Version: IAM_POLICY_LANGUAGE_VERSION, Statement: [{ Effect: "Deny", Action: "*", Resource: "*" }] } }] : [] };
      } } }, () => [], new Map());
      const decide = async () => (await gate.open(machine("p1"))).authorizer.decide("studio:GetRecordingCapturePolicy", [{ frn: resource("p1") }]).decision;
      expect(await decide()).toBe("allow");
      revoked = true;
      expect(await decide()).toBe("deny");
      revoked = false;
      broken = true;
      expect(await decide()).toBe("deny");
    });
  }

  it("uses the authenticated service identity for owner lookups even if a legacy user field differs", async () => {
    const gate = new ProgramIamGate({ workspaceId: "ws" }, () => [], new Map());
    const opened = await gate.open({ ...machine("p1"), userId: "another-person" });
    expect(opened.actorUserId).toBe("managed:one");
  });
});
