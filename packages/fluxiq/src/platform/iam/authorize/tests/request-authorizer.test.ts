import { describe, expect, it } from "vitest";
import { IamDecisionAuditFilter } from "../../audit/index.ts";
import { IamAuthorizer } from "../index.ts";
import { RecordingSink } from "./recording-sink.ts";
import { FakePolicySource, WORKSPACE, context, policy, policySet, principal } from "./authorize-fakes.ts";

const LIST = "studio:ListProjects";
const projects = ["p1", "p2", "p3"].map((id) => ({ id, frn: `frn:fluxiq:studio:ws1:project/${id}` }));
const toResource = (item: { frn: string }) => ({ frn: item.frn });
const scope = { frn: WORKSPACE };

const full = policy("Full", "identity", [{ Effect: "Allow", Action: "*", Resource: "*" }]);
const narrow = policy("Narrow", "identity", [
  { Effect: "Allow", Action: LIST, Resource: [WORKSPACE, "frn:fluxiq:studio:ws1:project/p1", "frn:fluxiq:studio:ws1:project/p3"] }
]);

function setup(identity: ReturnType<typeof policy>[]) {
  const source = new FakePolicySource(() => policySet(identity));
  const sink = new RecordingSink();
  return { source, sink, authorizer: new IamAuthorizer(source, sink) };
}

describe("IamRequestAuthorizer", () => {
  it("compiles once and shares one request id across decisions", async () => {
    const { authorizer, sink, source } = setup([narrow]);
    const request = await authorizer.forRequest(principal(), context());
    request.decide(LIST, [scope]);
    request.decide(LIST, [toResource(projects[0]!)]);
    expect(source.resolveCalls).toHaveLength(1);
    expect(sink.records).toHaveLength(2);
    expect(sink.records[0]?.requestId).toBe(sink.records[1]?.requestId);
  });

  it("takes the full-access fast path: every item, one row naming the list action and scope", async () => {
    const { authorizer, sink } = setup([full]);
    const request = await authorizer.forRequest(principal(), context());
    const kept = request.filter(LIST, projects, toResource, scope);
    expect(kept).toEqual(projects);
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({ action: LIST, resources: [WORKSPACE], decision: "allow" });
  });

  it("returns only the allowed items and records one deny row for the list, carrying how many it hid", async () => {
    const { authorizer, sink } = setup([narrow]);
    const request = await authorizer.forRequest(principal(), context({ via: "assistant" }));
    const kept = request.filter(LIST, projects, toResource, scope);
    expect(kept.map((item) => item.id)).toEqual(["p1", "p3"]);
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({ category: "deny", decision: "deny", action: LIST, resources: [WORKSPACE], matched: "implicit", hidden: 1, via: "assistant" });
  });

  it("hides as many items as the policies refuse, whatever the list's length, in one row", async () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ id: `q${index}`, frn: `frn:fluxiq:studio:ws1:project/q${index}` }));
    const evens = policy("Evens", "identity", [{ Effect: "Allow", Action: LIST, Resource: many.filter((_, index) => index % 2 === 0).map((item) => item.frn) }]);
    const { authorizer, sink } = setup([evens]);
    const request = await authorizer.forRequest(principal(), context());
    const kept = request.filter(LIST, many, toResource, scope);
    expect(kept.map((item) => item.id)).toEqual(many.filter((_, index) => index % 2 === 0).map((item) => item.id));
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({ category: "deny", action: LIST, resources: [WORKSPACE], hidden: 20 });
  });

  it("cites the statement that denied the first hidden item", async () => {
    const guarded = policy("Guarded", "identity", [
      { Effect: "Allow", Action: LIST, Resource: "*" },
      { Sid: "NoP2", Effect: "Deny", Action: LIST, Resource: "frn:fluxiq:studio:ws1:project/p2" }
    ]);
    const { authorizer, sink } = setup([guarded]);
    const request = await authorizer.forRequest(principal(), context());
    expect(request.filter(LIST, projects, toResource, scope).map((item) => item.id)).toEqual(["p1", "p3"]);
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({ decision: "deny", matched: { policy: "Guarded", sid: "NoP2" }, hidden: 1 });
  });

  it("records one allow row, and no count, when an item-by-item list hides nothing", async () => {
    const every = policy("Every", "identity", [{ Effect: "Allow", Action: LIST, Resource: [WORKSPACE, "frn:fluxiq:studio:ws1:project/*"] }]);
    const { authorizer, sink } = setup([every]);
    const request = await authorizer.forRequest(principal(), context());
    expect(request.filter(LIST, projects, toResource, scope)).toEqual(projects);
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({ category: "allow", decision: "allow", action: LIST, resources: [WORKSPACE] });
    expect(sink.records[0]).not.toHaveProperty("hidden");
  });

  it("persists no row behind the decision filter when a list of reads hides nothing", async () => {
    const every = policy("Every", "identity", [{ Effect: "Allow", Action: LIST, Resource: [WORKSPACE, "frn:fluxiq:studio:ws1:project/*"] }]);
    const source = new FakePolicySource(() => policySet([every]));
    const persisted = new RecordingSink();
    const request = await new IamAuthorizer(source, new IamDecisionAuditFilter(persisted, (action) => action === LIST)).forRequest(principal(), context());
    expect(request.filter(LIST, projects, toResource, scope)).toEqual(projects);
    expect(persisted.records).toEqual([]);
  });

  it("decides visibility item by item exactly as single decisions do", async () => {
    const { authorizer } = setup([narrow]);
    const request = await authorizer.forRequest(principal(), context());
    const one = projects.filter((item) => request.decide(LIST, [toResource(item)]).decision === "allow");
    expect(request.filter(LIST, projects, toResource, scope)).toEqual(one);
  });

  it("returns nothing and records one deny row when the list scope itself is denied", async () => {
    const { authorizer, sink } = setup([]);
    const request = await authorizer.forRequest(principal(), context());
    expect(request.filter(LIST, [], toResource, scope)).toEqual([]);
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({ decision: "deny", resources: [WORKSPACE] });
  });

  it("denies every item after a store failure", async () => {
    const { authorizer, sink, source } = setup([full]);
    source.failure = new Error("down");
    const request = await authorizer.forRequest(principal(), context());
    expect(request.filter(LIST, projects, toResource, scope)).toEqual([]);
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({ decision: "deny", resources: [WORKSPACE], hidden: 3 });
  });
});
