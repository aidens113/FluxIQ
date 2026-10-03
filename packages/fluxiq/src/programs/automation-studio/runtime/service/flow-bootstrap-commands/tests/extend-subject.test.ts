// What an extend build starts from: the Flow as a draft, and -- for a re-author
// -- where each of its nodes started in the run being repaired.
//
// Live run `run-murwcmx2-a1c6edf7` (t194, cause C-D): the re-author reran the
// Flow's list read on results page 5, where the refuted run had left the page.
// The seed now carries each node's start page beside its steps
// (`startedOnByStepId`), so the loop can put the page back before a rerun.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioFlowBootstrapExtendSubject } from "../extend-subject.ts";

const nodes: AutomationStudioFlowNode[] = [
  { id: "node.main.s1", definitionId: "web.output.browser-navigate", parameterValues: { url: "https://shop.test/" } },
  { id: "node.main.s2", definitionId: "web.output.dom-extract_list", parameterValues: { list: "results" } }
];
const edges: AutomationStudioFlowEdge[] = [{ id: "e1", sourceNodeId: "node.main.s1", targetNodeId: "node.main.s2" } as AutomationStudioFlowEdge];

const subject = (startPages?: Record<string, { location: string }>) => automationStudioFlowBootstrapExtendSubject({
  projectId: "project.one",
  flowId: "flow.one",
  listSubflows: async () => [{ subflowId: "subflow.main", graphFlowId: "graph.main", role: "primary" }],
  getFlowRouter: async () => ({ routerId: "router.one" }),
  getGraphFlow: async () => ({ nodes, edges }),
  ...(startPages ? { startPages } : {})
});

describe("an extend subject", () => {
  it("carries where each node started in the run being repaired, by the seeded step's id", async () => {
    const extend = await subject({ "node.main.s2": { location: "https://shop.test/s?k=earbuds" } });
    expect(extend?.seed.nodeIdByStepId).toEqual({ f1: "node.main.s1", f2: "node.main.s2" });
    expect(extend?.seed.startedOnByStepId).toEqual({ f2: { location: "https://shop.test/s?k=earbuds" } });
  });

  it("carries no start pages for an extend that repairs no run", async () => {
    const extend = await subject();
    expect(extend?.seed.steps).toHaveLength(2);
    expect(extend?.seed.startedOnByStepId).toEqual({});
  });
});
