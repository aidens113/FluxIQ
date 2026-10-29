import { describe, expect, it } from "vitest";
import { IamAuthorizer } from "../index.ts";
import { RecordingSink } from "./recording-sink.ts";
import { FakePolicySource, context, policy, policySet, principal } from "./authorize-fakes.ts";

const P1 = "frn:fluxiq:studio:ws1:project/p1";
const P2 = "frn:fluxiq:studio:ws1:project/p2";
const KEY = "frn:fluxiq:secrets:ws1:key/k1";
const READ = "studio:GetProject";

const reader = policy("Reader", "identity", [
  { Sid: "Projects", Effect: "Allow", Action: READ, Resource: "frn:fluxiq:studio:ws1:project/*" }
]);
const guard = policy("NoP2", "guardrail", [{ Sid: "Lock", Effect: "Deny", Action: "*", Resource: P2 }]);

function setup(identity = [reader], extra = {}) {
  const source = new FakePolicySource(() => policySet(identity, extra));
  const sink = new RecordingSink();
  return { source, sink, authorizer: new IamAuthorizer(source, sink) };
}

describe("IamAuthorizer.authorize", () => {
  it("allows and records one allow row with every audit field", async () => {
    const { authorizer, sink } = setup();
    const ctx = context({ requestId: "req-1", sourceIp: "203.0.113.7", origin: "api" });
    const decision = await authorizer.authorize(principal(), READ, [{ frn: P1 }], ctx);
    expect(decision.decision).toBe("allow");
    expect(sink.records).toEqual([
      {
        category: "allow",
        time: Math.floor(ctx.currentTimeMs / 1000),
        requestId: "req-1",
        principal: "frn:fluxiq:iam:ws1:user/alice",
        action: READ,
        resources: [P1],
        decision: "allow",
        matched: { policy: "Reader", sid: "Projects" },
        origin: "api",
        ipPrefix: "203.0.113.0/24"
      }
    ]);
  });

  it("generates a request id when the context has none", async () => {
    const { authorizer, sink } = setup();
    await authorizer.authorize(principal(), READ, [{ frn: P1 }], context());
    expect(sink.records[0]?.requestId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(sink.records[0]?.ipPrefix).toBeNull();
  });

  it("denies on an explicit deny and records a deny row", async () => {
    const { authorizer, sink } = setup([reader], { guardrails: [guard] });
    const decision = await authorizer.authorize(principal(), READ, [{ frn: P2 }], context());
    expect(decision.decision).toBe("deny");
    expect(decision.resources[0]?.reason).toBe("explicit-deny");
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({ category: "deny", decision: "deny", matched: { policy: "NoP2", sid: "Lock" } });
  });

  it("denies implicitly when nothing allows", async () => {
    const { authorizer, sink } = setup();
    const decision = await authorizer.authorize(principal(), READ, [{ frn: KEY }], context());
    expect(decision.decision).toBe("deny");
    expect(decision.matched).toBe("implicit");
    expect(sink.records[0]).toMatchObject({ category: "deny", matched: "implicit" });
  });

  it("records one row naming every resource and denies when any is denied", async () => {
    const { authorizer, sink } = setup();
    const decision = await authorizer.authorize(principal(), READ, [{ frn: P1 }, { frn: KEY }], context());
    expect(decision.decision).toBe("deny");
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]?.resources).toEqual([P1, KEY]);
  });

  it("fails closed with its own audit row when the store throws", async () => {
    const { authorizer, sink, source } = setup();
    source.failure = new Error("store down");
    const decision = await authorizer.authorize(principal(), READ, [{ frn: P1 }], context({ requestId: "req-2" }));
    expect(decision.decision).toBe("deny");
    expect(decision.resources).toEqual([{ resource: P1, decision: "deny", reason: "implicit-deny", matched: "implicit" }]);
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({ category: "deny", requestId: "req-2", resources: [P1] });
  });

  it("passes the assumed role and session policies to the source", async () => {
    const { authorizer, source } = setup();
    const session = policy("S", "session", [{ Effect: "Allow", Action: "*", Resource: "*" }]);
    await authorizer.authorize(principal(), READ, [{ frn: P1 }], context(), { assumedRole: "deployer", sessionPolicies: [session] });
    expect(source.resolveCalls[0]?.options).toEqual({ assumedRole: "deployer", sessionPolicies: [session] });
  });
});
