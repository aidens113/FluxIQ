import { describe, expect, it } from "vitest";
import { automationStudioSubflowGraphIsOwned } from "../subflow-graph-ownership.ts";

const owned = { metadata: { subflowGraph: true, parentFlowId: "flow-1", parentSubflowId: "sub-1" } };
const asSubflowGraph = () => "subflow_graph";

describe("automationStudioSubflowGraphIsOwned", () => {
  it("accepts a persisted Subflow graph owned by the Flow and the selected Subflow", () => {
    expect(automationStudioSubflowGraphIsOwned({ subflowId: "sub-1" }, owned, "flow-1", asSubflowGraph)).toBe(true);
  });

  it("refuses when nothing was selected or no graph was read", () => {
    expect(automationStudioSubflowGraphIsOwned(undefined, owned, "flow-1", asSubflowGraph)).toBe(false);
    expect(automationStudioSubflowGraphIsOwned({ subflowId: "sub-1" }, undefined, "flow-1", asSubflowGraph)).toBe(false);
  });

  it("refuses a graph persisted another way, or owned by another Flow or Subflow", () => {
    expect(automationStudioSubflowGraphIsOwned({ subflowId: "sub-1" }, owned, "flow-1", () => "orchestration")).toBe(false);
    expect(automationStudioSubflowGraphIsOwned({ subflowId: "sub-1" }, owned, "flow-2", asSubflowGraph)).toBe(false);
    expect(automationStudioSubflowGraphIsOwned({ subflowId: "sub-2" }, owned, "flow-1", asSubflowGraph)).toBe(false);
    expect(automationStudioSubflowGraphIsOwned({ subflowId: "sub-1" }, { metadata: { ...owned.metadata, subflowGraph: false } }, "flow-1", asSubflowGraph)).toBe(false);
  });
});
