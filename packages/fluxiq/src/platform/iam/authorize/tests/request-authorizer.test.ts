import { describe, expect, it } from "vitest";
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

  it("records one row per item and returns only the allowed ones otherwise", async () => {
    const { authorizer, sink } = setup([narrow]);
    const request = await authorizer.forRequest(principal(), context());
    const kept = request.filter(LIST, projects, toResource, scope);
    expect(kept.map((item) => item.id)).toEqual(["p1", "p3"]);
    expect(sink.records).toHaveLength(3);
    expect(sink.records.map((record) => record.decision)).toEqual(["allow", "deny", "allow"]);
    expect(sink.records.map((record) => record.resources[0])).toEqual(projects.map((item) => item.frn));
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
    expect(sink.records.every((record) => record.decision === "deny")).toBe(true);
  });
});
