import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapSubflow } from "../../plan/index.ts";
import { automationStudioSubflowPartKey, automationStudioSubflowRekeyedParts } from "../index.ts";

const SYMBOL = /^[a-z][a-z0-9_-]{0,63}$/u;
const call = (key: string, subflowId: string) => ({ key, definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", parameters: { subflowId, inputs: {}, outputs: {} } });

describe("a helper part's key in a proposal", () => {
  it("is the subflow's key, a dash and its own", () => {
    expect(automationStudioSubflowPartKey("find_listing", "narrow")).toBe("find_listing-narrow");
  });

  it("stays a plan symbol of at most 64 characters, distinct for distinct parts, when the two are long", () => {
    const head = `s${"a".repeat(40)}`;
    const one = automationStudioSubflowPartKey(head, `p${"b".repeat(40)}`);
    const two = automationStudioSubflowPartKey(head, `p${"b".repeat(39)}c`);
    expect(one).toMatch(SYMBOL);
    expect(two).toMatch(SYMBOL);
    expect(one).not.toBe(two);
  });

  it("rewrites every call to a re-keyed part, in the target and in other parts, and leaves the given subflows alone", () => {
    const target: AutomationStudioFlowBootstrapSubflow = { key: "find_listing", name: "Find", role: "primary", nodes: [call("s1", "narrow"), call("s2", "elsewhere")], edges: [] };
    const narrow: AutomationStudioFlowBootstrapSubflow = { key: "narrow", name: "Narrow", role: "utility", nodes: [call("s1", "sort")], edges: [] };
    const sort: AutomationStudioFlowBootstrapSubflow = { key: "sort", name: "Sort", role: "utility", nodes: [], edges: [] };
    const out = automationStudioSubflowRekeyedParts(target, [narrow, sort]);
    expect(out.map((subflow) => subflow.key)).toEqual(["find_listing", "find_listing-narrow", "find_listing-sort"]);
    expect(out[0]!.nodes.map((node) => node.parameters?.subflowId)).toEqual(["find_listing-narrow", "elsewhere"]);
    expect(out[1]!.nodes[0]!.parameters?.subflowId).toBe("find_listing-sort");
    expect(narrow.key).toBe("narrow");
    expect(target.nodes[0]!.parameters?.subflowId).toBe("narrow");
  });
});
