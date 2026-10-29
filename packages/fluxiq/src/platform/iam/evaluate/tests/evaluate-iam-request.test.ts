// A request over several resources: allowed only when every one is.
import { describe, expect, it } from "vitest";
import { compileIamPolicySet, evaluateIamRequest } from "../index.ts";
import { testContext, testPolicy, testPolicySet, testPrincipal } from "./iam-test-policy.ts";

const P1 = "frn:fluxiq:studio:ws1:project/p1";
const P2 = "frn:fluxiq:studio:ws1:project/p2";
const KEY = "frn:fluxiq:secrets:ws1:key/k1";

const principal = testPrincipal();
const policy = testPolicy("Projects", "identity", [
  { Sid: "Projects", Effect: "Allow", Action: "*", Resource: "frn:fluxiq:studio:ws1:project/*" },
  { Sid: "NoP2", Effect: "Deny", Action: "*", Resource: P2 }
]);
const compiled = compileIamPolicySet(testPolicySet({ identity: [policy] }), principal, "ws1");
const action = "studio:UpdateProject";

describe("evaluateIamRequest", () => {
  it("denies implicitly with no resources", () => {
    expect(evaluateIamRequest(compiled, principal, action, [], testContext())).toEqual({ principal: principal.frn, action, decision: "deny", matched: "implicit", resources: [], fullAccess: false });
  });

  it("allows when every resource is allowed, citing the first", () => {
    const decision = evaluateIamRequest(compiled, principal, action, [{ frn: P1 }, { frn: "frn:fluxiq:studio:ws1:project/p3" }], testContext());
    expect(decision.decision).toBe("allow");
    expect(decision.matched).toEqual({ policy: "Projects", sid: "Projects" });
    expect(decision.resources.map((resource) => resource.decision)).toEqual(["allow", "allow"]);
    expect(decision.fullAccess).toBe(false);
    expect(decision.principal).toBe("frn:fluxiq:iam:ws1:user/alice");
  });

  it("denies when any resource is denied, citing the first denied one", () => {
    const decision = evaluateIamRequest(compiled, principal, action, [{ frn: P1 }, { frn: KEY }, { frn: P2 }], testContext());
    expect(decision.decision).toBe("deny");
    expect(decision.matched).toBe("implicit");
    expect(decision.resources.map((resource) => resource.reason)).toEqual(["allowed", "implicit-deny", "explicit-deny"]);
  });

  it("cites an explicit deny when it is the first denied resource", () => {
    const decision = evaluateIamRequest(compiled, principal, action, [{ frn: P2 }, { frn: KEY }], testContext());
    expect(decision.matched).toEqual({ policy: "Projects", sid: "NoP2" });
  });
});
