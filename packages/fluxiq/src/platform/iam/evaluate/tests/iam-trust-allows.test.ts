// Role trust policies: who may assume a role.
import { describe, expect, it } from "vitest";
import { iamTrustAllows } from "../index.ts";
import { testContext, testPolicy, testPrincipal } from "./iam-test-policy.ts";

const ASSUME = "iam:AssumeRole";
const alice = testPrincipal();
const bob = testPrincipal({ id: "bob" });
const outsider = testPrincipal({ workspaceId: "ws2" });

describe("iamTrustAllows", () => {
  const trust = testPolicy("DeployerTrust", "trust", [
    { Sid: "Members", Effect: "Allow", Principal: { FluxIQ: "frn:fluxiq:iam:${fluxiq:WorkspaceId}:user/*" }, Action: ASSUME },
    { Sid: "NotBob", Effect: "Deny", Principal: { FluxIQ: ["frn:fluxiq:iam:*:user/bob"] }, Action: ASSUME }
  ]);

  it("allows a caller a pattern matches, citing the statement", () => {
    expect(iamTrustAllows(trust, alice, testContext())).toEqual({ policy: "DeployerTrust", sid: "Members" });
  });

  it("lets a matching Deny win", () => {
    expect(iamTrustAllows(trust, bob, testContext())).toBeNull();
  });

  it("binds the workspace variable to the request's workspace", () => {
    expect(iamTrustAllows(trust, outsider, testContext())).toBeNull();
    expect(iamTrustAllows(trust, alice, testContext({ workspaceId: null }))).toBeNull();
  });

  it("matches caller FRNs case-sensitively", () => {
    const exact = testPolicy("T", "trust", [{ Effect: "Allow", Principal: { FluxIQ: "frn:fluxiq:iam:ws1:user/Alice" }, Action: ASSUME }]);
    expect(iamTrustAllows(exact, alice, testContext())).toBeNull();
  });

  it("evaluates conditions for the caller and request", () => {
    const panelOnly = testPolicy("T", "trust", [{ Sid: "Panel", Effect: "Allow", Principal: { FluxIQ: "frn:fluxiq:iam:ws1:*" }, Action: ASSUME, Condition: { StringEquals: { "fluxiq:RequestOrigin": "panel" }, Bool: { "fluxiq:MfaPresent": true } } }]);
    expect(iamTrustAllows(panelOnly, alice, testContext({ mfaPresent: true }))).toEqual({ policy: "T", sid: "Panel" });
    expect(iamTrustAllows(panelOnly, alice, testContext({ mfaPresent: true, origin: "api" }))).toBeNull();
    expect(iamTrustAllows(panelOnly, alice, testContext())).toBeNull();
  });

  it("treats resource keys as missing", () => {
    const owned = testPolicy("T", "trust", [{ Effect: "Allow", Principal: { FluxIQ: "*" }, Action: ASSUME, Condition: { StringEquals: { "fluxiq:ResourceOwner": "alice" } } }]);
    expect(iamTrustAllows(owned, alice, testContext())).toBeNull();
  });

  it("refuses a policy that is not a trust policy", () => {
    const identity = testPolicy("I", "identity", [{ Effect: "Allow", Action: "*", Resource: "*" }]);
    expect(() => iamTrustAllows(identity, alice, testContext())).toThrow(TypeError);
  });
});
