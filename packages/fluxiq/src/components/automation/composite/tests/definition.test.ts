import { describe, expect, it } from "vitest";
import { captureExecutableFlowSnapshot } from "../../../../flows/executable/composite/index.ts";
import type { AutomationStudioFlowValueType } from "../../../../flows/executable/interface/index.ts";
import { projectPublishedFlowSnapshotToNodeDefinition, flowValueTypeToNodeValueType } from "../index.ts";

describe("executable composite definition projection", () => {
  it("uses executable contracts and supplied presentation without a publication envelope", () => {
    const snapshot = captureExecutableFlowSnapshot({
      flowId: "flow.shared/item", scope: { kind: "domain", domainId: "inventory" },
      interface: { inputs: [{ id: "item", name: "Item", valueType: { kind: "string" }, required: true }], outputs: [{ id: "count", name: "Count", valueType: { kind: "number" } }] },
      errors: [{ id: "missing" }], nodes: [], edges: []
    }, "2.0.0");
    const definition = projectPublishedFlowSnapshotToNodeDefinition({ ...snapshot, name: "Inventory" });
    expect(definition.id).toBe("composite.flow.flow.shared%2Fitem@2.0.0");
    expect(definition.label).toBe("Inventory");
    expect(definition.description).toBe("Call published Flow flow.shared/item@2.0.0.");
    expect(definition.availability).toEqual({ kind: "domain", domainId: "inventory" });
    expect(definition.inputs).toEqual([{ id: "item", label: "Item", valueType: "string", required: true }]);
    expect(definition.outputs).toEqual([{ id: "count", label: "Count", valueType: "number" }, { id: "error.missing", label: "missing", valueType: "object", role: "error" }]);
  });

  it("maps declared value types to the existing node-port vocabulary", () => {
    const cases: Array<[AutomationStudioFlowValueType, string]> = [
      [{ kind: "string" }, "string"], [{ kind: "number" }, "number"], [{ kind: "boolean" }, "boolean"],
      [{ kind: "array", item: { kind: "string" } }, "array"], [{ kind: "record" }, "object"],
      [{ kind: "schema", schemaId: "schema" }, "object"], [{ kind: "json" }, "object"],
      [{ kind: "unknown" }, "any"], [{ kind: "null" }, "any"]
    ];
    for (const [value, expected] of cases) expect(flowValueTypeToNodeValueType(value)).toBe(expected);
  });
});
