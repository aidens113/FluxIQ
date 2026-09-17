import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import {
  AutomationStudioNodeRegistry,
  canonicalBuiltinAutomationNodeDefinitions,
  type AutomationStudioNodeDefinition,
  type AutomationStudioNodeParameterContract
} from "../../../../nodes/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapNode, type AutomationStudioFlowBootstrapPlan } from "../index.ts";

// A generated plan must be refused wherever the runtime would refuse it, so a
// malformed structured value never reaches dispatch. These rows cover the three
// refusals validation used to miss: a record output the record-set parser
// rejects, a policy action naming an output nothing registered, and a value a
// domain's own parameter contract rejects.

const resolution = {
  scope: { kind: "domain" as const, domainId: "demo" },
  runtimeCapabilities: [] as string[],
  permissions: [] as string[]
};

const VALID_RECORD_OUTPUT: JsonObject = {
  datasetId: "listings",
  label: "Listings",
  recordsPath: "result.extracted",
  writeMode: "replace",
  schema: {
    schemaVersion: "0.1",
    fields: [{ id: "title", label: "Title", valueType: "string", required: true }]
  }
};

function recordOutputWithoutPath(): JsonObject {
  const copy = { ...VALID_RECORD_OUTPUT };
  delete copy.recordsPath;
  return copy;
}

// Declares where its records are, as the web domain's list extraction does, so
// a record output written without `recordsPath` takes this one.
function extractDefinition(metadata: JsonObject | null = { recordsPath: "result.extracted" }): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id: "domain.demo.extract",
    version: "1.0.0",
    label: "Read items",
    description: "Reads every item of a repeating structure.",
    category: "action",
    source: { kind: "importer", domainId: "demo", implementationKey: "demo.extract" },
    availability: { kind: "domain", domainId: "demo" },
    capabilities: { executable: true },
    outputAction: { fixedOutputId: "demo.extract" },
    inputs: [],
    outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "records", label: "Records", valueType: "array" }],
    parameters: [
      { id: "items", label: "Items", valueType: "object", required: true },
      { id: "recordOutput", label: "Save records", valueType: "json", allowStateBinding: false, ui: { control: "record-output" } }
    ],
    ...(metadata ? { metadata } : {})
  };
}

function registry(contract?: AutomationStudioNodeParameterContract, definition = extractDefinition()): AutomationStudioNodeRegistry {
  const value = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, definition]);
  if (contract) value.bindParameterContract("domain.demo.extract", contract);
  return value;
}

function planWith(node: AutomationStudioFlowBootstrapNode): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Demo", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [node], edges: [] }]
  };
}

function extractNode(parameters: JsonObject): AutomationStudioFlowBootstrapNode {
  return { key: "extract", definitionId: "domain.demo.extract", definitionVersion: "1.0.0", parameters, outputActionId: "demo.extract" };
}

function policyActionNode(parameters: JsonObject): AutomationStudioFlowBootstrapNode {
  return { key: "run", definitionId: "builtin.policy.action", definitionVersion: "1.0.0", parameters };
}

function codes(plan: AutomationStudioFlowBootstrapPlan, value = registry()): string[] {
  return validateAutomationStudioFlowBootstrapPlan({ plan, registry: value, resolution }).issues.map((issue) => issue.code);
}

describe("a record output in a generated plan", () => {
  it("is refused with the record-set parser's codes, at the parameter", () => {
    const result = validateAutomationStudioFlowBootstrapPlan({
      plan: planWith(extractNode({ items: { item: ".row" }, recordOutput: { nonsense: true } })),
      registry: registry(),
      resolution
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "record_output.unknown_key",
      "record_output.invalid_dataset_id",
      "record_output.invalid_write_mode",
      "record_schema.not_object"
    ]));
    expect(new Set(result.issues.map((issue) => issue.path))).toEqual(new Set(["plan.subflows.0.nodes.0.parameters.recordOutput"]));
  });

  it("takes a missing recordsPath from the path its definition declares, as the node does at dispatch", () => {
    const withoutPath = recordOutputWithoutPath();

    expect(codes(planWith(extractNode({ items: { item: ".row" }, recordOutput: withoutPath })))).toEqual([]);
  });

  it("is still refused when it is otherwise malformed, with the path defaulted", () => {
    const withoutPath = recordOutputWithoutPath();

    const result = codes(planWith(extractNode({ items: { item: ".row" }, recordOutput: { ...withoutPath, writeMode: "sometimes" } })));

    expect(result).toEqual(["record_output.invalid_write_mode"]);
  });

  it("is refused for a missing recordsPath when its definition declares none, the policy action included", () => {
    const withoutPath = recordOutputWithoutPath();

    expect(codes(planWith(extractNode({ items: { item: ".row" }, recordOutput: withoutPath })), registry(undefined, extractDefinition(null))))
      .toEqual(["record_output.missing_records_path"]);
    expect(codes(planWith(policyActionNode({ outputId: "demo.extract", recordOutput: withoutPath })))).toEqual(["record_output.missing_records_path"]);
  });

  describe("on the node that writes records", () => {
    const writeRecords = canonicalBuiltinAutomationNodeDefinitions.find((definition) => definition.id === "builtin.data.write-records")!;
    const saveNode = (parameters: JsonObject): AutomationStudioFlowBootstrapNode => ({ key: "save", definitionId: writeRecords.id, definitionVersion: writeRecords.version, parameters });
    const recordCodes = (parameters: JsonObject) => codes(planWith(saveNode(parameters))).filter((code) => code.startsWith("record_"));

    it("takes the path the node sets itself, so leaving it out is not refused", () => {
      expect(recordCodes({ recordOutput: recordOutputWithoutPath() })).toEqual([]);
      expect(recordCodes({ recordOutput: { ...recordOutputWithoutPath(), writeMode: "sometimes" } })).toEqual(["record_output.invalid_write_mode"]);
    });

    // `run-mu4yk4u1-60a1c3a4`: a created Flow's save node passed validation
    // and failed when it ran, because this node has nothing to save without one.
    it("refuses it left out or null, as its run does", () => {
      expect(recordCodes({})).toEqual(["record_output.not_object"]);
      expect(recordCodes({ recordOutput: null })).toEqual(["record_output.not_object"]);
    });
  });

  it("keeps a recordsPath the author wrote, and refuses it when it is invalid", () => {
    expect(codes(planWith(extractNode({ items: { item: ".row" }, recordOutput: { ...VALID_RECORD_OUTPUT, recordsPath: "" } }))))
      .toEqual(["record_output.invalid_records_path"]);
  });

  it("is refused on the policy action as well, which saves records the same way", () => {
    expect(codes(planWith(policyActionNode({ outputId: "demo.extract", recordOutput: { ...VALID_RECORD_OUTPUT, writeMode: "sometimes" } }))))
      .toContain("record_output.invalid_write_mode");
  });

  it("is refused when it asks to encrypt a field, as the runtime refuses it", () => {
    const encrypted = { ...VALID_RECORD_OUTPUT, schema: { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string", handling: "encrypt" }] } };

    expect(codes(planWith(extractNode({ items: { item: ".row" }, recordOutput: encrypted })))).toContain("record_schema.encrypt_unavailable");
  });

  it("is accepted when it parses, and null is accepted as saving nothing", () => {
    expect(codes(planWith(extractNode({ items: { item: ".row" }, recordOutput: VALID_RECORD_OUTPUT })))).toEqual([]);
    expect(codes(planWith(extractNode({ items: { item: ".row" }, recordOutput: null })))).toEqual([]);
    expect(codes(planWith(policyActionNode({ outputId: "demo.extract", recordOutput: VALID_RECORD_OUTPUT })))).toEqual([]);
  });
});

describe("the output a policy action names in a generated plan", () => {
  it("is refused when no available node declares it", () => {
    const result = validateAutomationStudioFlowBootstrapPlan({ plan: planWith(policyActionNode({ outputId: "not.a.registered.output" })), registry: registry(), resolution });

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "bootstrap.unknown_output_reference", path: "plan.subflows.0.nodes.0.parameters.outputId" }));
  });

  it("is refused when only a node outside this scope declares it", () => {
    const hidden: AutomationStudioNodeDefinition = {
      ...extractDefinition(),
      id: "domain.other.extract",
      source: { kind: "importer", domainId: "other", implementationKey: "other.extract" },
      availability: { kind: "domain", domainId: "other" },
      outputAction: { fixedOutputId: "other.extract" }
    };
    const scoped = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, hidden]);

    expect(codes(planWith(policyActionNode({ outputId: "other.extract" })), scoped)).toContain("bootstrap.unknown_output_reference");
  });

  it("is refused when it is bound to state, since the run would choose the output", () => {
    expect(codes(planWith(policyActionNode({ outputId: { $state: { path: "run.output" } } })))).toContain("bootstrap.invalid_state_binding");
  });

  it("is accepted when an available node declares it, fixed or allowed", () => {
    const allowed = new AutomationStudioNodeRegistry([
      ...canonicalBuiltinAutomationNodeDefinitions,
      { ...extractDefinition(), outputAction: { allowedOutputIds: ["demo.extract", "demo.extract-all"] } }
    ]);

    expect(codes(planWith(policyActionNode({ outputId: "demo.extract" })))).toEqual([]);
    expect(codes(planWith(policyActionNode({ outputId: "demo.extract-all" })), allowed)).toEqual([]);
  });
});

describe("a domain's parameter contract", () => {
  it("refuses a value the contract reports, with the contract's code, at the parameter", () => {
    const seen: Array<{ definitionId: string; parameterId: string; value: JsonValue }> = [];
    const contract: AutomationStudioNodeParameterContract = (input) => {
      seen.push(input);
      return input.parameterId === "items" && !(input.value as JsonObject).item ? ["demo.items.missing_item"] : [];
    };

    const result = validateAutomationStudioFlowBootstrapPlan({ plan: planWith(extractNode({ items: { nonsense: true } })), registry: registry(contract), resolution });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([{
      severity: "error",
      code: "demo.items.missing_item",
      message: "Node parameter value does not satisfy its domain contract.",
      path: "plan.subflows.0.nodes.0.parameters.items"
    }]);
    expect(seen).toEqual([{ definitionId: "domain.demo.extract", parameterId: "items", value: { nonsense: true } }]);
  });

  it("accepts a value the contract reports nothing for", () => {
    expect(codes(planWith(extractNode({ items: { item: ".row" } })), registry(() => []))).toEqual([]);
  });

  it("is not asked about a value that already fails its declared type, or is a whole state binding", () => {
    const asked: string[] = [];
    const contract: AutomationStudioNodeParameterContract = ({ parameterId }) => { asked.push(parameterId); return ["demo.items.refused"]; };

    const wrongType = codes(planWith(extractNode({ items: "not-an-object" })), registry(contract));
    const bound = codes(planWith(extractNode({ items: { $state: { path: "run.items" } } })), registry(contract));

    expect(wrongType).toEqual(["bootstrap.invalid_parameter_value"]);
    expect(bound).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("cannot change the plan it is shown", () => {
    const plan = planWith(extractNode({ items: { item: ".row" } }));
    const before = structuredClone(plan);

    codes(plan, registry(({ value }) => { (value as JsonObject).item = "mutated"; return []; }));

    expect(plan).toEqual(before);
  });

  it("fails closed when it throws or answers with something other than a list", () => {
    expect(codes(planWith(extractNode({ items: { item: ".row" } })), registry(() => { throw new Error("contract bug"); })))
      .toEqual(["bootstrap.parameter_contract_failed"]);
    expect(codes(planWith(extractNode({ items: { item: ".row" } })), registry((() => Promise.resolve([])) as unknown as AutomationStudioNodeParameterContract)))
      .toEqual(["bootstrap.parameter_contract_failed"]);
  });

  it("reports a malformed, borrowed, or excessive code as a bounded generic violation", () => {
    const reported = ["Has Spaces", "bootstrap.primary_count", "x".repeat(200), ...Array.from({ length: 20 }, (_, index) => `demo.items.issue_${index}`)];

    const result = codes(planWith(extractNode({ items: { item: ".row" } })), registry(() => reported));

    expect(result[0]).toBe("bootstrap.parameter_contract_violation");
    expect(result.filter((code) => code === "bootstrap.parameter_contract_violation")).toHaveLength(1);
    expect(result).not.toContain("bootstrap.primary_count");
    expect(result).toHaveLength(8);
  });
});
