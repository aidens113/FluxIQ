import { expect, it } from "vitest";
import type { ExecutableFlow } from "../../../graph/index.ts";
import { compileExecutableRegions } from "../index.ts";

it("requires complete ownership and typed cross-region handoffs without persistence fields", () => {
  const flow: ExecutableFlow = { flowId: "flow.regions", name: "Regions", scope: { kind: "global" }, interface: { inputs: [], outputs: [] }, errors: [], variables: [], nodes: [{ id: "prepare", definitionId: "builtin.control.start" }, { id: "decide", definitionId: "builtin.policy.action" }], edges: [{ id: "prepare.decide", sourceNodeId: "prepare", targetNodeId: "decide", sourcePortId: "success", targetPortId: "in" }], regions: [{ id: "prepare", name: "Prepare", kind: "deterministic", nodeIds: ["prepare"], entryPorts: [], exitPorts: [{ id: "success", name: "Success", valueType: { kind: "unknown" } }] }, { id: "decide", name: "Decide", kind: "policy", nodeIds: ["decide"], entryPorts: [{ id: "in", name: "In", valueType: { kind: "unknown" } }], exitPorts: [] }] };
  expect(compileExecutableRegions(flow)).toMatchObject({ ok: false, issues: [{ code: "flow.region_cross_edge_without_handoff" }] });
  flow.regionHandoffs = [{ id: "handoff", fromRegionId: "prepare", fromPortId: "success", toRegionId: "decide", toPortId: "in" }];
  const compiled = compileExecutableRegions(flow);
  expect(compiled).toMatchObject({ ok: true, plan: { nodeRegionIds: { prepare: "prepare", decide: "decide" }, handoffs: flow.regionHandoffs } });
  if (compiled.ok) expect(compiled.plan.regions[0]?.nodeIds).not.toBe(flow.regions?.[0]?.nodeIds);
});

it("compiles a graph with no scope or persistence envelope", () => {
  expect(compileExecutableRegions({ nodes: [], edges: [] })).toEqual({ ok: true, plan: { regions: [], handoffs: [], nodeRegionIds: {} } });
});
