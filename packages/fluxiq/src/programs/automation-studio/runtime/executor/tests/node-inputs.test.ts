// A node's parameters reading another node's output by that node's key in its
// graph (`$node.<key>.<output>`, P5 t270), resolved to the id the run keeps
// that node's outputs under -- and left alone, so the run reports it missing,
// when no single node of the graph carries the key.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { resolveAutomationNodeParameterValues } from "../../../nodes/index.ts";
import { automationStudioNodeOutputReferences } from "../node-inputs.ts";

const node = (id: string, key?: string): AutomationStudioFlowNode => ({ id, definitionId: "test.node", ...(key ? { metadata: { bootstrapSymbolicKey: key } } : {}) });
const flow = (nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument => ({ schemaVersion: "0.1", flowId: "flow.test", ownerKind: "policy", ownerId: "flow.test", name: "Test", nodes, edges: [], createdAt: 1, updatedAt: 1 });
const ref = (path: string) => ({ $state: { path } });

describe("a node-output reference", () => {
  it("names the id of the one node carrying the key, at any depth, and keeps every other binding and value", () => {
    const graph = flow([node("node.bootstrap.ab12.primary.s3", "s3"), node("node.saved.copy", "s4")]);
    const parameters = { text: ref("$node.s3.value.label"), nested: { list: [ref("$node.s3.records")] }, query: { $state: { path: "query", fallback: "x" } }, plain: "s3" };
    expect(automationStudioNodeOutputReferences(graph, parameters)).toEqual({
      text: ref("node.bootstrap.ab12.primary.s3.value.label"),
      nested: { list: [ref("node.bootstrap.ab12.primary.s3.records")] },
      query: { $state: { path: "query", fallback: "x" } },
      plain: "s3"
    });
  });

  it("resolves through the executor's own resolver to what that node produced", () => {
    const graph = flow([node("node.bootstrap.ab12.primary.s3", "s3")]);
    const rewritten = automationStudioNodeOutputReferences(graph, { text: ref("$node.s3.value.label") });
    expect(resolveAutomationNodeParameterValues(rewritten, { "node.bootstrap.ab12.primary.s3.value": { label: "Ada" } })).toEqual({ values: { text: "Ada" }, missingPaths: [] });
  });

  it("is left as written, and so reported missing, when no node or more than one carries the key", () => {
    const graph = flow([node("node.a", "s2"), node("node.b", "s2"), node("node.c")]);
    const parameters = { twice: ref("$node.s2.value"), none: ref("$node.s9.value") };
    expect(automationStudioNodeOutputReferences(graph, parameters)).toBe(parameters);
    expect(resolveAutomationNodeParameterValues(parameters, { "node.a.value": 1, "node.b.value": 2 }).missingPaths).toEqual(["$node.s2.value", "$node.s9.value"]);
  });
});
