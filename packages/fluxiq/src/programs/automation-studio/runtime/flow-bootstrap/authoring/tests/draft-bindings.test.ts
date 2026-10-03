// A draft step's state bindings, through assembly into a plan.
//
// A binding is the value a step reads at run time -- the row a loop pass is
// on, or a Flow input with the value the build tested it on -- and assembly
// must carry it into the plan exactly as it was, whatever the parameter's
// declared type. Then the graph is checked for what a binding needs from it: a
// row needs a loop over a list around it, and an input needs a name no output
// of the Flow overwrites.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationNodePort, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep, AutomationStudioFlowDraftStepRouting } from "../../../flow-draft/index.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { assembleAutomationStudioFlowDraftPlan, type AutomationStudioFlowDraftWrittenStep } from "../assemble-draft.ts";

const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};

// The library, with typing able to take the row a pass is on, and one node
// whose parameter is a list, so a binding on an array parameter is exercised.
const ROW_INPUT: AutomationNodePort = { id: "item", label: "Item", valueType: "any", role: "data", required: false };
const base = webDomainNodeDefinitionsFixture();
const typing = base.find((definition) => definition.id === "web.output.dom-type")!;
const fillMany: AutomationStudioNodeDefinition = {
  ...typing,
  id: "web.output.dom-fill_many",
  label: "Fill Many",
  description: "Enter each of several values.",
  outputAction: { fixedOutputId: "web.dom.fill_many" },
  inputs: [...typing.inputs, ROW_INPUT],
  parameters: [
    { id: "selector", label: "Selector", valueType: "string", required: true, allowStateBinding: true },
    { id: "values", label: "Values", valueType: "array", allowStateBinding: true },
    { id: "more", label: "More values", valueType: "array", allowStateBinding: true }
  ]
};
const registry = new AutomationStudioNodeRegistry();
for (const definition of [...base.map((definition) => definition.id === typing.id ? { ...definition, inputs: [...definition.inputs, ROW_INPUT] } : definition), fillMany]) registry.register(definition);

const ROW_NAME = { $state: { path: "item.name" } };
const QUERY = { $state: { path: "query", fallback: "x" } };

function step(position: number, actionId: string, parameters: JsonObject, routing?: AutomationStudioFlowDraftStepRouting): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, callId: `call.${position}`, actionId, toolId: "core.run_node",
    input: { parameters }, ranWith: { parameters }, effect: "mutate", effectApplied: true, disposition: "kept",
    ...(routing ? { routing } : {})
  };
}

/**
 * The write a run-node step gets (`runtime/llm/node-tools/draft-step.ts`):
 * the node is the action, and each parameter it ran with is one entry, an
 * object or a list written as its JSON.
 */
function write(draftStep: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep {
  const parameters = (draftStep.ranWith?.parameters ?? {}) as JsonObject;
  return {
    description: draftStep.actionId,
    node: draftStep.actionId,
    entries: Object.entries(parameters).map(([key, value]: [string, JsonValue]) => ({ key, value: typeof value === "string" ? value : JSON.stringify(value) }))
  };
}

function assemble(steps: AutomationStudioFlowDraftStep[]) {
  return assembleAutomationStudioFlowDraftPlan({ steps, write, registry, resolution, summary: "Enter each name" });
}

const errors = (assembled: ReturnType<typeof assemble>) => assembled.issues.filter((issue) => issue.severity === "error");
const listStep = (position: number) => step(position, "web.output.dom-extract_list", { extractList: { item: ".row", fields: { name: ".name" } } });

/** Search on an input, read the rows, then type each row's name and fill a list with it. */
const LOOPED = [
  step(1, "web.output.dom-type", { selector: "#search", text: QUERY }),
  listStep(2),
  step(3, "web.output.dom-type", { selector: ".row-field", text: ROW_NAME }, { kind: "repeat", over: "d2", through: "d4" }),
  step(4, "web.output.dom-fill_many", { selector: ".row-tags", values: ROW_NAME, more: ["fixed", QUERY] })
];

describe("a state binding through assembly", () => {
  it("reaches the plan node unchanged on a string parameter and on an array parameter, and the plan validates", () => {
    const assembled = assemble(LOOPED);
    expect(errors(assembled)).toEqual([]);
    const nodes = assembled.plan!.subflows[0]!.nodes;
    const typed = nodes.filter((node) => node.definitionId === "web.output.dom-type");
    expect(typed.map((node) => node.parameters?.text)).toEqual([QUERY, ROW_NAME]);
    const filled = nodes.find((node) => node.definitionId === "web.output.dom-fill_many")!;
    expect(filled.parameters?.values).toEqual(ROW_NAME);
    expect(filled.parameters?.more).toEqual(["fixed", QUERY]);
    const validated = validateAutomationStudioFlowBootstrapPlan({ plan: assembled.plan!, registry, resolution });
    expect(validated.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(validated.ok).toBe(true);
  });

  it("keeps an input binding on a step outside any loop", () => {
    const assembled = assemble([step(1, "web.output.dom-type", { selector: "#search", text: QUERY })]);
    expect(errors(assembled)).toEqual([]);
    expect(assembled.plan!.subflows[0]!.nodes[0]!.parameters?.text).toEqual(QUERY);
  });
});

describe("a row binding", () => {
  it("is refused on a step outside a span that repeats over a list, naming the step", () => {
    const assembled = assemble([listStep(1), step(2, "web.output.dom-type", { selector: ".row-field", text: ROW_NAME })]);
    expect(assembled.plan).toBeUndefined();
    expect(assembled.refusedPlan).toBeDefined();
    const refused = errors(assembled).filter((issue) => issue.code === "flow_draft.row_binding_outside_loop");
    expect(refused).toHaveLength(1);
    expect(refused[0]!.path).toBe("draft.steps.2");
    expect(refused[0]!.message).toContain("Step 2");
  });

  it("is refused after the loop it could have been in, and inside a span that repeats while a check holds", () => {
    const after = assemble([...LOOPED, step(5, "web.output.dom-type", { selector: ".after", text: { $state: { path: "item.name" } } })]);
    expect(errors(after).map((issue) => [issue.code, issue.path])).toEqual([["flow_draft.row_binding_outside_loop", "draft.steps.5"]]);
    const whileCheck = assemble([
      step(1, "web.output.dom-click", { selector: "#more" }),
      step(2, "web.output.dom-type", { selector: ".row-field", text: ROW_NAME }, { kind: "repeat", over: "d1", through: "d2" })
    ]);
    expect(errors(whileCheck).map((issue) => [issue.code, issue.path])).toEqual([["flow_draft.row_binding_outside_loop", "draft.steps.2"]]);
  });

  it("assembles inside a span that repeats over a list", () => {
    expect(errors(assemble(LOOPED))).toEqual([]);
  });
});

describe("a Flow input's name", () => {
  it("is refused when it is item, the row's name", () => {
    const assembled = assemble([step(1, "web.output.dom-type", { selector: "#search", text: { $state: { path: "item", fallback: "x" } } })]);
    expect(assembled.plan).toBeUndefined();
    expect(errors(assembled).map((issue) => [issue.code, issue.path])).toContainEqual(["flow_draft.input_shadowed", "draft.steps.1"]);
  });

  it("is refused when it is the id of an output port of a node the plan uses", () => {
    const assembled = assemble([listStep(1), step(2, "web.output.dom-type", { selector: "#search", text: { $state: { path: "records", fallback: "x" } } })]);
    expect(assembled.plan).toBeUndefined();
    expect(errors(assembled).map((issue) => [issue.code, issue.path])).toEqual([["flow_draft.input_shadowed", "draft.steps.2"]]);
  });

  it("is refused when two steps test it with different values, naming both values and the steps", () => {
    const assembled = assemble([
      step(1, "web.output.dom-type", { selector: "#search", text: { $state: { path: "query", fallback: "blue towels" } } }),
      step(2, "web.output.dom-type", { selector: "#again", text: { $state: { path: "query", fallback: "red towels" } } })
    ]);
    expect(assembled.plan).toBeUndefined();
    const refused = errors(assembled).filter((issue) => issue.code === "flow_draft.input_conflict");
    expect(refused.map((issue) => issue.path)).toEqual(["draft.steps.1"]);
    expect(refused[0]!.message).toContain("\"blue towels\" and \"red towels\"");
    expect(refused[0]!.message).toContain("steps 1, 2");
  });

  it("is free when every step tests it with the same value", () => {
    expect(errors(assemble(LOOPED))).toEqual([]);
  });

  it("is free when no node of the plan declares that output", () => {
    const assembled = assemble([step(1, "web.output.dom-type", { selector: "#search", text: { $state: { path: "records", fallback: "x" } } })]);
    expect(errors(assembled)).toEqual([]);
  });
});
