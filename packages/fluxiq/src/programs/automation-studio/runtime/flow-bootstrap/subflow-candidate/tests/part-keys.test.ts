import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapSubflow } from "../../plan/index.ts";
import { automationStudioSubflowPartKey, automationStudioSubflowRekeyedParts, automationStudioSubflowStepId } from "../index.ts";

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

  it("renames a dataset id derived from a part's old step id to its new one, and leaves a written one and the target's alone", () => {
    const read = (key: string, datasetId: string) => ({ key, definitionId: "test.read-list", definitionVersion: "1.0.0", parameters: { output: { datasetId, schema: { schemaVersion: "0.1", fields: [] }, writeMode: "append" } } });
    const target: AutomationStudioFlowBootstrapSubflow = { key: "find_titles", name: "Find", role: "utility", nodes: [read("s1", "shelf-find_titles-s1")], edges: [] };
    const narrow: AutomationStudioFlowBootstrapSubflow = { key: "narrow", name: "Narrow", role: "utility", nodes: [read("s1", "titles-narrow-s1"), read("s2", "kept"), read("s3", "narrow-s3")], edges: [] };
    const out = automationStudioSubflowRekeyedParts(target, [narrow]);
    const ids = (subflow: AutomationStudioFlowBootstrapSubflow) => subflow.nodes.map((node) => (node.parameters?.output as { datasetId: string }).datasetId);
    expect(ids(out[0]!)).toEqual(["shelf-find_titles-s1"]);
    expect(ids(out[1]!)).toEqual(["titles-find_titles-narrow-s1", "kept", "narrow-s3"]);
    expect(automationStudioSubflowStepId(out[1]!.key, "s1")).toBe("find_titles-narrow-s1");
    expect(ids(narrow)).toEqual(["titles-narrow-s1", "kept", "narrow-s3"]);
  });

  it("keeps a renamed dataset id within the record-set limit", () => {
    const head = "a".repeat(190);
    const narrow: AutomationStudioFlowBootstrapSubflow = { key: "narrow", name: "Narrow", role: "utility", nodes: [{ key: "s1", definitionId: "test.read-list", definitionVersion: "1.0.0", parameters: { output: { datasetId: `${head}-narrow-s1` } } }], edges: [] };
    const out = automationStudioSubflowRekeyedParts({ key: "find_titles", name: "Find", role: "utility", nodes: [], edges: [] }, [narrow]);
    const id = (out[1]!.nodes[0]!.parameters?.output as { datasetId: string }).datasetId;
    expect(id.length).toBeLessThanOrEqual(200);
    expect(id.endsWith("-find_titles-narrow-s1")).toBe(true);
  });

  it("renames a target's derived dataset ids under its key when it was written under another", () => {
    const read = (key: string, datasetId: string) => ({ key, definitionId: "test.read-list", definitionVersion: "1.0.0", parameters: { output: { datasetId } } });
    const target: AutomationStudioFlowBootstrapSubflow = { key: "find_titles", name: "Find", role: "primary", nodes: [read("s1", "titles-main-s1"), read("s2", "kept")], edges: [] };
    const ids = (subflows: AutomationStudioFlowBootstrapSubflow[]) => subflows[0]!.nodes.map((node) => (node.parameters?.output as { datasetId: string }).datasetId);
    expect(ids(automationStudioSubflowRekeyedParts(target, [], { targetWrittenKey: "main" }))).toEqual(["titles-find_titles-s1", "kept"]);
    expect(ids(automationStudioSubflowRekeyedParts(target, []))).toEqual(["titles-main-s1", "kept"]);
  });
});
