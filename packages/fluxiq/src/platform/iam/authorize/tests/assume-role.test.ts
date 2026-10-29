import { describe, expect, it } from "vitest";
import { IamAuthorizer } from "../index.ts";
import { RecordingSink } from "./recording-sink.ts";
import { FakePolicySource, context, policy, policySet, principal } from "./authorize-fakes.ts";

const ROLE_FRN = "frn:fluxiq:iam:ws1:role/deployer";
const trust = policy("trust", "trust", [
  { Effect: "Allow", Principal: { FluxIQ: "frn:fluxiq:iam:ws1:user/alice" }, Action: "iam:AssumeRole" }
]);
const mayAssume = policy("MayAssume", "identity", [{ Effect: "Allow", Action: "iam:AssumeRole", Resource: ROLE_FRN }]);

function setup(identity = [mayAssume]) {
  const source = new FakePolicySource(() => policySet(identity));
  source.addRole("deployer", trust);
  const sink = new RecordingSink();
  return { source, sink, authorizer: new IamAuthorizer(source, sink) };
}

describe("IamAuthorizer.assumeRole", () => {
  it("returns the role-session principal and options when trust and identity both allow", async () => {
    const { authorizer, sink } = setup();
    const session = policy("S", "session", [{ Effect: "Allow", Action: "*", Resource: "*" }]);
    const result = await authorizer.assumeRole(principal(), "deployer", context(), session);
    expect(result).toEqual({
      allowed: true,
      principal: { type: "role", id: "deployer", workspaceId: "ws1", frn: ROLE_FRN },
      options: { assumedRole: "deployer", sessionPolicies: [session] }
    });
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({ category: "allow", action: "iam:AssumeRole", resources: [ROLE_FRN] });
  });

  it("is denied and audited when the trust policy does not allow the caller", async () => {
    const { authorizer, sink } = setup();
    const result = await authorizer.assumeRole(principal({ id: "bob" }), "deployer", context(), undefined);
    expect(result.allowed).toBe(false);
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({ category: "deny", principal: "frn:fluxiq:iam:ws1:user/bob", resources: [ROLE_FRN] });
  });

  it("is denied and audited when the caller's own policies do not allow iam:AssumeRole", async () => {
    const { authorizer, sink } = setup([]);
    const result = await authorizer.assumeRole(principal(), "deployer", context());
    expect(result.allowed).toBe(false);
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({ category: "deny", matched: "implicit" });
  });

  it("is denied and audited for a role that does not exist", async () => {
    const { authorizer, sink } = setup();
    const result = await authorizer.assumeRole(principal(), "ghost", context());
    expect(result.allowed).toBe(false);
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]?.category).toBe("deny");
  });

  it("uses no session policies when none is passed", async () => {
    const { authorizer } = setup();
    const result = await authorizer.assumeRole(principal(), "deployer", context());
    expect(result).toMatchObject({ allowed: true, options: { assumedRole: "deployer", sessionPolicies: [] } });
  });
});
