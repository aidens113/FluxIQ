import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveAutomationGraphUpdate } from "./useAutomationGraphController";

describe("Automation graph controller", () => {
  it("resolves direct and functional document updates", () => {
    expect(resolveAutomationGraphUpdate([1], [2, 3])).toEqual([2, 3]);
    expect(resolveAutomationGraphUpdate([1], (current) => [...current, 2])).toEqual([1, 2]);
  });

  it("owns canonical Policy Canvas node and edge state", () => {
    const source = readFileSync(new URL("../views/GraphEditorViews.tsx", import.meta.url), "utf8");
    expect(source).toContain("useAutomationGraphController<AutomationPolicyNodeData>");
    expect(source).toContain("replacePolicyGraph({ nodes: nextNodes, edges: nextEdges })");
    expect(source).not.toContain("const [policyNodes, setPolicyNodes] = useState");
    expect(source).not.toContain("const [policyEdges, setPolicyEdges] = useState");
  });
});