import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../flows/executable/graph/index.ts";
import { automationStudioRefreshInputs } from "../index.ts";

const output: JsonObject = { schema: { schemaVersion: "0.1", fields: [{ id: "date", label: "Date", valueType: "string" }] }, process: { where: [{ field: "date", atMost: { $state: { path: "latest", fallback: "2030-01-02" } }, as: "date" }], declaration: { version: 1, source: "a".repeat(64), revision: 1, bindings: { date: "date" } } } };
const node: AutomationStudioFlowNode = { id: "read", definitionId: "fixture.read", parameterValues: { recordOutput: output } };
const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow.test", ownerKind: "policy", ownerId: "flow.test", name: "Test", nodes: [node], edges: [], createdAt: 1, updatedAt: 1 };

describe("engine automatic processing input provenance", () => {
  it("refuses a missing caller input even when arbitrary state/variables hold a matching name", () => {
    const read = automationStudioRefreshInputs(flow, node, { latest: "2030-01-03" }, {}, new Map([["latest", "2030-01-03"]]));
    expect(read.missingPaths).toEqual(["latest"]);
    expect(read.values).toBe(read.authored);
  });
  it("resolves only actual caller input, ahead of unrelated same-named merged state", () => {
    const read = automationStudioRefreshInputs(flow, node, { latest: "2030-01-09" }, { inputs: { latest: "2030-01-03" } }, new Map([["latest", "2030-01-08"]]));
    expect(read.missingPaths).toEqual([]);
    expect(read.values).toMatchObject({ recordOutput: { process: { where: [{ atMost: "2030-01-03" }] } } });
    expect(node.parameterValues?.recordOutput).toEqual(output);
  });
  it("retains legacy fallback semantics when automatic provenance is absent", () => {
    const legacy = structuredClone(node);
    delete ((legacy.parameterValues!.recordOutput as JsonObject).process as JsonObject).declaration;
    expect(automationStudioRefreshInputs(flow, legacy, {}, {}, new Map()).missingPaths).toEqual([]);
  });
  it("refuses absent schema and literal binding-shaped caller values before dispatch", () => {
    const missing = structuredClone(node);
    delete (missing.parameterValues!.recordOutput as JsonObject).schema;
    expect(automationStudioRefreshInputs(flow, missing, {}, { inputs: { latest: false } }, new Map()).missingPaths).toEqual(["recordOutput.schema"]);
    expect(automationStudioRefreshInputs(flow, node, { other: "2030-01-03" }, { inputs: { latest: { $state: { path: "other", fallback: "2030-01-03" } } } }, new Map()).missingPaths).toEqual(["latest"]);
  });
});
