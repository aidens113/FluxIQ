import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioFactConditionResult } from "../fact-condition.ts";
import { selectAutomationStudioEntry } from "../entry-selection.ts";
import { automationStudioSubflowContract } from "../subflow-contract.ts";

const nodes: AutomationStudioFlowNode[] = [
  { id: "start", definitionId: "builtin.control.start" },
  { id: "search", definitionId: "web.press", metadata: { "fluxiq.entry": { id: "signed-in", order: 2, when: [{ fact: "host.signedIn", op: "exists" }], requires: [] } } },
  { id: "results", definitionId: "web.read", metadata: { "fluxiq.entry": { id: "on-results", order: 1, when: [{ fact: "host.results", op: "visible" }], requires: ["query"] }, "fluxiq.checkpoint": { id: "results", requires: ["query"] } } },
  { id: "cart", definitionId: "web.read", metadata: { "fluxiq.entry": { id: "on-cart", order: 1, when: [], requires: [] } } }
];

const truth = (value: AutomationStudioFactConditionResult["truth"]): AutomationStudioFactConditionResult[] => [{ truth: value, capturedAt: 1 }];

describe("Subflow contract and entry selection", () => {
  const contract = automationStudioSubflowContract({ nodes, metadata: { "fluxiq.successCheck": [{ fact: "host.done", op: "exists" }] } });

  it("reads entries, checkpoints and the success check from versioned metadata", () => {
    expect(contract.problems).toEqual([]);
    expect(contract.entries.map((entry) => [entry.id, entry.nodeId, entry.order])).toEqual([["signed-in", "search", 2], ["on-results", "results", 1], ["on-cart", "cart", 1]]);
    expect(contract.checkpoints).toEqual([{ id: "results", nodeId: "results", when: [], requires: ["query"] }]);
    expect(contract.successCheck).toEqual([{ fact: "host.done", op: "exists" }]);
  });

  it("takes the first entry by order whose when is all true and whose requires are bound", () => {
    const selection = selectAutomationStudioEntry({
      entries: contract.entries,
      defaultNodeId: "start",
      whenResults: new Map([["on-results", truth("true")], ["signed-in", truth("true")]]),
      bound: new Set(["query"])
    });
    expect(selection).toMatchObject({ kind: "entry", id: "on-results", nodeId: "results" });
  });

  it("breaks an order tie by document order", () => {
    const selection = selectAutomationStudioEntry({ entries: contract.entries, defaultNodeId: "start", whenResults: new Map([["on-results", truth("false")]]), bound: new Set() });
    // on-results (order 1, first in the graph) is false; on-cart (order 1, asks nothing) is next.
    expect(selection).toMatchObject({ kind: "entry", id: "on-cart" });
  });

  it("skips an entry whose requires are unbound, or whose when is unknown, and falls back to the default", () => {
    const entries = contract.entries.filter((entry) => entry.id !== "on-cart");
    const selection = selectAutomationStudioEntry({ entries, defaultNodeId: "start", whenResults: new Map([["on-results", truth("true")], ["signed-in", truth("unknown")]]), bound: new Set() });
    expect(selection.kind).toBe("default");
    expect(selection.nodeId).toBe("start");
    expect(selection.considered).toEqual([
      { id: "on-results", nodeId: "results", when: "true", unbound: ["query"] },
      { id: "signed-in", nodeId: "search", when: "unknown", unbound: [] }
    ]);
  });

  it("names malformed and duplicate declarations", () => {
    const broken = automationStudioSubflowContract({
      nodes: [
        { id: "a", definitionId: "x", metadata: { "fluxiq.entry": { order: 1 } } },
        { id: "b", definitionId: "x", metadata: { "fluxiq.checkpoint": { id: "cp", when: [{ fact: "f", op: "nope" }] } } },
        { id: "c", definitionId: "x", metadata: { "fluxiq.checkpoint": { id: "cp" } } }
      ]
    });
    expect(broken.problems).toHaveLength(3);
  });
});
