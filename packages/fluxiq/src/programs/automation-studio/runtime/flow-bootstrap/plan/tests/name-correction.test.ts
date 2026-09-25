import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapNode, type AutomationStudioFlowBootstrapPlan } from "../index.ts";

// A parameter name a model wrote with a slip is not an unknown name. These
// rows hold the four things that must all be true at once: the corrected name
// reaches the plan that will be built and run, the correction is recorded as an
// assumption rather than applied silently, a name with no plausible candidate
// is still refused, and nothing a correction touches is checked any less
// afterwards.

const resolution = {
  scope: { kind: "domain" as const, domainId: "demo" },
  runtimeCapabilities: [] as string[],
  permissions: [] as string[]
};

/**
 * `filter-text` and `filter-list` are deliberately the same distance from the
 * name the tests write, `filter-rows`: they share one token with it and differ
 * in the other by four characters each, so every name signal scores them
 * identically. Nothing but the shape of the value can decide between them,
 * which is exactly the case the standing instruction names.
 */
function extractDefinition(): AutomationStudioNodeDefinition {
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
    outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [
      { id: "items", label: "Items", valueType: "object", required: true },
      { id: "maxRecords", label: "Maximum records", valueType: "number", constraints: { integer: true, minimum: 1 } },
      { id: "filter-text", label: "Filter by text", valueType: "string" },
      { id: "filter-list", label: "Filter by a list of values", valueType: "array" }
    ]
  };
}

function registry(): AutomationStudioNodeRegistry {
  return new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, extractDefinition()]);
}

function planWith(parameters: JsonObject): AutomationStudioFlowBootstrapPlan {
  const node: AutomationStudioFlowBootstrapNode = {
    key: "extract",
    definitionId: "domain.demo.extract",
    definitionVersion: "1.0.0",
    parameters,
    outputActionId: "demo.extract"
  };
  return {
    schemaVersion: "0.1",
    router: { name: "Demo", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [node], edges: [] }]
  };
}

function validate(plan: AutomationStudioFlowBootstrapPlan) {
  return validateAutomationStudioFlowBootstrapPlan({ plan, registry: registry(), resolution });
}

/** The parameters the accepted plan would actually be built and run with. */
function acceptedParameters(result: ReturnType<typeof validate>): JsonObject | undefined {
  return result.validated?.plan.subflows[0]?.nodes[0]?.parameters;
}

describe("a parameter name written with a slip", () => {
  it("is corrected in the plan that will be run, not merely excused", () => {
    const result = validate(planWith({ items: { item: ".row" }, maxRecord: 25 }));

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(acceptedParameters(result)).toEqual({ items: { item: ".row" }, maxRecords: 25 });
    expect(result.validated?.subflows[0]?.nodes[0]?.parameters).toEqual({ items: { item: ".row" }, maxRecords: 25 });
  });

  it("is recorded as an assumption, in closed codes and identifiers", () => {
    const result = validate(planWith({ items: { item: ".row" }, maxRecord: 25 }));

    expect(result.validated?.assumptions).toEqual([{
      kind: "parameter_name",
      how: "nearest",
      score: expect.any(Number),
      subflowKey: "primary",
      nodeKey: "extract",
      definitionId: "domain.demo.extract",
      parameterId: "maxRecords",
      writtenName: "maxRecord",
      valueShape: "number"
    }]);
    expect(result.validated?.assumptions?.[0]?.score).toBeGreaterThan(0.25);
  });

  it("is still checked exactly as a correctly written name is", () => {
    // `minimum: 1` refuses 0, and the refusal names the corrected parameter --
    // so the correction moved the value into the slot and the slot's own rules
    // then applied to it.
    const result = validate(planWith({ items: { item: ".row" }, maxRecord: 0 }));

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({
      code: "bootstrap.invalid_parameter_value",
      path: "plan.subflows.0.nodes.0.parameters.maxRecords"
    })]);
  });

  it("never takes the place of a name that was written correctly", () => {
    // `item` is nearest to `items`, but `items` was written, so it is withdrawn
    // from the match and nothing is left that `item` plausibly names.
    const result = validate(planWith({ items: { item: ".row" }, item: { item: ".row" } }));

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(["bootstrap.unknown_parameter"]);
    expect(result.issues[0]?.path).toBe("plan.subflows.0.nodes.0.parameters.item");
  });
});

describe("two parameters a name cannot choose between", () => {
  it("is settled by the shape of the value: a list goes to the list parameter", () => {
    const result = validate(planWith({ items: { item: ".row" }, "filter-rows": ["red", "blue"] }));

    expect(result.ok).toBe(true);
    expect(acceptedParameters(result)).toEqual({ items: { item: ".row" }, "filter-list": ["red", "blue"] });
    expect(result.validated?.assumptions?.[0]).toMatchObject({ parameterId: "filter-list", valueShape: "list" });
  });

  it("and by the same name goes to the text parameter when text was written", () => {
    const result = validate(planWith({ items: { item: ".row" }, "filter-rows": "red" }));

    expect(result.ok).toBe(true);
    expect(acceptedParameters(result)).toEqual({ items: { item: ".row" }, "filter-text": "red" });
    expect(result.validated?.assumptions?.[0]).toMatchObject({ parameterId: "filter-text", valueShape: "text" });
  });
});

describe("a name that is nobody's", () => {
  it("is refused as an unknown parameter, with nothing assumed", () => {
    const result = validate(planWith({ items: { item: ".row" }, banana: true }));

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({
      code: "bootstrap.unknown_parameter",
      path: "plan.subflows.0.nodes.0.parameters.banana"
    })]);
    expect(result.validated).toBeUndefined();
  });
});

describe("a plan whose names were all written correctly", () => {
  it("is handed on as the very object it arrived as, with no assumption recorded", () => {
    const plan = planWith({ items: { item: ".row" }, maxRecords: 25, "filter-list": ["red"] });

    const result = validate(plan);

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.validated?.plan).toBe(plan);
    expect(result.validated?.assumptions).toBeUndefined();
    expect(Object.keys(result.validated ?? {})).toEqual(["plan", "risk", "subflows"]);
  });
});
