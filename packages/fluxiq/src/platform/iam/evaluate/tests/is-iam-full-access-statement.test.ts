// The full-access grant, statement by statement, and the set-level fast path
// it enables in compileIamPolicySet / evaluateIamRequest.
import { describe, expect, it } from "vitest";
import type { IamPolicySet } from "../../types.ts";
import { compileIamPolicySet, evaluateIamRequest } from "../index.ts";
import { isIamFullAccessStatement } from "../is-iam-full-access-statement.ts";
import { testContext, testPolicy, testPolicySet, testPrincipal } from "./iam-test-policy.ts";

const WORKSPACE_WIDE = "frn:fluxiq:*:${fluxiq:WorkspaceId}:*";
const WORKSPACE_FRN = "frn:fluxiq:platform::workspace/ws1";
const PROJECT = "frn:fluxiq:studio:ws1:project/p1";
const OTHER_PROJECT = "frn:fluxiq:studio:ws2:project/p1";
const CREATE = "studio:CreateProject";

const allowAll = (sid: string, resource: string | string[] = "*") => ({ Sid: sid, Effect: "Allow", Action: "*", Resource: resource });

describe("isIamFullAccessStatement", () => {
  const statement = (value: unknown) => testPolicy("P", "identity", [value]).document.Statement[0]!;

  it("accepts Allow * on * or on the workspace pattern", () => {
    expect(isIamFullAccessStatement(statement(allowAll("A")), "ws1")).toBe(true);
    expect(isIamFullAccessStatement(statement(allowAll("A", WORKSPACE_WIDE)), "ws1")).toBe(true);
    expect(isIamFullAccessStatement(statement({ Effect: "Allow", Action: ["studio:*", "*"], Resource: ["*"] }), "ws1")).toBe(true);
  });

  it("refuses a condition, a narrower action or resource, a negation, a Deny, and an unbound workspace", () => {
    expect(isIamFullAccessStatement(statement({ Effect: "Allow", Action: "*", Resource: "*", Condition: { Bool: { "fluxiq:MfaPresent": true } } }), "ws1")).toBe(false);
    expect(isIamFullAccessStatement(statement({ Effect: "Allow", Action: "studio:*", Resource: "*" }), "ws1")).toBe(false);
    expect(isIamFullAccessStatement(statement({ Effect: "Allow", Action: "*", Resource: "frn:fluxiq:studio:ws1:*" }), "ws1")).toBe(false);
    expect(isIamFullAccessStatement(statement({ Effect: "Allow", NotAction: "iam:*", Resource: "*" }), "ws1")).toBe(false);
    expect(isIamFullAccessStatement(statement({ Effect: "Allow", Action: "*", NotResource: "frn:fluxiq:iam:*:*" }), "ws1")).toBe(false);
    expect(isIamFullAccessStatement(statement({ Effect: "Deny", Action: "*", Resource: "*" }), "ws1")).toBe(false);
    expect(isIamFullAccessStatement(statement(allowAll("A", WORKSPACE_WIDE)), null)).toBe(false);
  });
});

describe("compileIamPolicySet fullAccess", () => {
  const owner = testPolicy("Owner", "identity", [allowAll("Owner")]);
  const workspaceOwner = testPolicy("WsOwner", "identity", [allowAll("WsOwner", WORKSPACE_WIDE)]);
  const compile = (set: IamPolicySet, workspaceId: string | null = "ws1") => compileIamPolicySet(set, testPrincipal(), workspaceId);

  it("is true for an unconditional Allow * with nothing else", () => {
    expect(compile(testPolicySet({ identity: [owner] })).fullAccess).toBe(true);
    expect(compile(testPolicySet({ identity: [workspaceOwner] })).fullAccess).toBe(true);
  });

  it("is false with a Deny anywhere in the set", () => {
    const deny = (kind: "identity" | "guardrail" | "session" | "boundary") => testPolicy("D", kind, [allowAll("Keep"), { Sid: "D", Effect: "Deny", Action: "iam:DeleteUser", Resource: "*" }].filter((entry) => kind !== "guardrail" || entry.Effect === "Deny"));
    expect(compile(testPolicySet({ identity: [owner, deny("identity")] })).fullAccess).toBe(false);
    expect(compile(testPolicySet({ identity: [owner], guardrails: [deny("guardrail")] })).fullAccess).toBe(false);
    expect(compile(testPolicySet({ identity: [owner], sessions: [deny("session")] })).fullAccess).toBe(false);
    expect(compile(testPolicySet({ identity: [owner], boundary: deny("boundary") })).fullAccess).toBe(false);
  });

  it("needs every session policy and the boundary to be full access too", () => {
    const narrow = (kind: "session" | "boundary") => testPolicy("N", kind, [{ Effect: "Allow", Action: "studio:*", Resource: "*" }]);
    const wide = (kind: "session" | "boundary") => testPolicy("W", kind, [allowAll("W")]);
    expect(compile(testPolicySet({ identity: [owner], sessions: [narrow("session")] })).fullAccess).toBe(false);
    expect(compile(testPolicySet({ identity: [owner], boundary: narrow("boundary") })).fullAccess).toBe(false);
    expect(compile(testPolicySet({ identity: [owner], sessions: [wide("session"), wide("session")], boundary: wide("boundary") })).fullAccess).toBe(true);
  });

  it("is false for a conditional grant and for a platform-level principal", () => {
    const conditional = testPolicy("C", "identity", [{ Effect: "Allow", Action: "*", Resource: "*", Condition: { StringEquals: { "fluxiq:RequestOrigin": "panel" } } }]);
    expect(compile(testPolicySet({ identity: [conditional] })).fullAccess).toBe(false);
    expect(compile(testPolicySet({ identity: [owner] }), null).fullAccess).toBe(false);
  });

  it("takes the fast path in the workspace only, citing the grant", () => {
    const compiled = compile(testPolicySet({ identity: [owner] }));
    expect(compiled.coveredByFullAccess(PROJECT)).toBe(true);
    expect(compiled.coveredByFullAccess(WORKSPACE_FRN)).toBe(true);
    expect(compiled.coveredByFullAccess(OTHER_PROJECT)).toBe(false);
    const inside = evaluateIamRequest(compiled, testPrincipal(), CREATE, [{ frn: PROJECT }], testContext());
    expect(inside).toMatchObject({ decision: "allow", fullAccess: true, matched: { policy: "Owner", sid: "Owner" } });
    // Outside the workspace the full evaluation runs; `*` still allows, without the fast path.
    const outside = evaluateIamRequest(compiled, testPrincipal(), CREATE, [{ frn: OTHER_PROJECT }], testContext());
    expect(outside).toMatchObject({ decision: "allow", fullAccess: false });
  });

  it("never lets the workspace pattern reach the workspace FRN or another workspace", () => {
    const compiled = compile(testPolicySet({ identity: [workspaceOwner] }));
    expect(compiled.coveredByFullAccess(WORKSPACE_FRN)).toBe(false);
    expect(compiled.decide("studio:ListProjects", { frn: WORKSPACE_FRN }, testContext())).toMatchObject({ decision: "deny", reason: "implicit-deny" });
    expect(compiled.decide(CREATE, { frn: OTHER_PROJECT }, testContext())).toMatchObject({ decision: "deny", reason: "implicit-deny" });
    const listed = compile(testPolicySet({ identity: [testPolicy("WsOwner", "identity", [allowAll("WsOwner", [WORKSPACE_WIDE, "frn:fluxiq:platform::workspace/${fluxiq:WorkspaceId}"])])] }));
    expect(listed.coveredByFullAccess(WORKSPACE_FRN)).toBe(true);
    expect(evaluateIamRequest(listed, testPrincipal(), "studio:ListProjects", [{ frn: WORKSPACE_FRN }], testContext())).toMatchObject({ decision: "allow", fullAccess: true });
  });

  it("needs each session grant to cover the resource for the fast path", () => {
    const session = testPolicy("Sess", "session", [allowAll("S", WORKSPACE_WIDE)]);
    const compiled = compile(testPolicySet({ identity: [owner], sessions: [session] }));
    expect(compiled.fullAccess).toBe(true);
    expect(compiled.coveredByFullAccess(PROJECT)).toBe(true);
    expect(compiled.coveredByFullAccess(WORKSPACE_FRN)).toBe(false);
    expect(compiled.decide("studio:ListProjects", { frn: WORKSPACE_FRN }, testContext()).decision).toBe("deny");
  });

  it("still refuses a malformed request on the fast path", () => {
    const compiled = compile(testPolicySet({ identity: [owner] }));
    expect(compiled.decide("studio:*", { frn: PROJECT }, testContext()).decision).toBe("deny");
    expect(evaluateIamRequest(compiled, testPrincipal(), "studio:*", [{ frn: PROJECT }], testContext()).fullAccess).toBe(false);
  });
});
