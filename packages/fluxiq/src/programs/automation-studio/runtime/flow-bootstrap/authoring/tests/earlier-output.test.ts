// An earlier step's output, through assembly into a plan (P5, t270).
//
// A draft step reads another step's output by that step's own id
// (`{"$state":{"path":"$step.<id>.<output>[.<field>]"}}`,
// `../../../flow-draft/binding-forms.ts`). The plan names nodes `s1`, `s2`, ...
// by where they sit in the assembled graph, which is not the draft's
// position: a withdrawn step leaves no node, and a join or loop the routing
// adds takes a key of its own. So assembly rewrites each such binding to the
// key of the node its step became (`$node.<key>`), which the stored Flow keeps
// and the executor resolves (`../../../executor/node-inputs.ts`). A
// binding the graph cannot honour refuses the plan, naming the reading step:
// a step that is not in the Flow, one that does not run before the reader,
// an output its node does not declare, a step the Flow does not always run,
// and a step of a repeat read from outside it.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationNodePort } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep, AutomationStudioFlowDraftStepRouting } from "../../../flow-draft/index.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { assembleAutomationStudioFlowDraftPlan, type AutomationStudioFlowDraftWrittenStep } from "../assemble-draft.ts";

const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};

// The library, with the single-element read declaring a record output and
// typing able to take a row, so both a field of an output and a repeat are exercised.
const VALUE_OUTPUT: AutomationNodePort = { id: "value", label: "Value", valueType: "object", role: "data" };
const ROW_INPUT: AutomationNodePort = { id: "item", label: "Item", valueType: "any", role: "data", required: false };
const READ = "web.output.dom-extract";
const TYPE = "web.output.dom-type";
const CLICK = "web.output.dom-click";
const LIST = "web.output.dom-extract_list";
// Core's built-ins come with it, for the join an optional step adds and the loop a repeat does.
const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) {
  if (definition.id === READ) registry.register({ ...definition, outputs: [...definition.outputs, VALUE_OUTPUT] });
  else if (definition.id === TYPE) registry.register({ ...definition, inputs: [...definition.inputs, ROW_INPUT] });
  else registry.register(definition);
}

const earlier = (id: string, output: string, path?: string): JsonObject => ({ $state: { path: `$step.${id}.${output}${path ? `.${path}` : ""}` } });

function step(position: number, id: string, actionId: string, parameters: JsonObject, over: Partial<AutomationStudioFlowDraftStep> & { routing?: AutomationStudioFlowDraftStepRouting } = {}): AutomationStudioFlowDraftStep {
  return {
    position, id, iteration: position, callId: `call.${position}`, actionId, toolId: "core.run_node",
    input: { parameters }, ranWith: { parameters }, effect: "mutate", effectApplied: true, disposition: "kept", ...over
  };
}

/** The write a run-node step gets: the node is the action, each parameter one entry (`../../../llm/node-tools/draft-step.ts`). */
function write(draftStep: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep {
  const parameters = (draftStep.ranWith?.parameters ?? {}) as JsonObject;
  return {
    description: draftStep.actionId,
    node: draftStep.actionId,
    entries: Object.entries(parameters).map(([key, value]: [string, JsonValue]) => ({ key, value: typeof value === "string" ? value : JSON.stringify(value) }))
  };
}

const assemble = (steps: AutomationStudioFlowDraftStep[]) =>
  assembleAutomationStudioFlowDraftPlan({ steps: steps.filter((each) => each.disposition === "kept"), write, registry, resolution, summary: "Copy the name" });
const errors = (assembled: ReturnType<typeof assemble>) => assembled.issues.filter((issue) => issue.severity === "error");
const codes = (assembled: ReturnType<typeof assemble>) => errors(assembled).map((issue) => [issue.code, issue.path]);

describe("an earlier step's output through assembly", () => {
  it("names the node its step became, by that node's key, however far the key is from the draft's position", () => {
    const assembled = assemble([
      step(1, "d31", CLICK, { selector: "#consent" }, { routing: { kind: "optional" } }),
      step(2, "d32", TYPE, { selector: "#gone", text: "x" }, { disposition: "dropped" }),
      step(3, "d33", TYPE, { selector: "#gone", text: "y" }, { disposition: "dropped" }),
      step(4, "d34", READ, { selector: "#name" }),
      step(5, "d35", TYPE, { selector: "#copy", text: earlier("d34", "value", "label") })
    ]);
    expect(errors(assembled)).toEqual([]);
    const nodes = assembled.plan!.subflows[0]!.nodes;
    // The click, the join its optional run adds, the read, the type.
    expect(nodes.map((node) => [node.key, node.definitionId])).toEqual([["s1", CLICK], ["s2", "builtin.control.merge"], ["s3", READ], ["s4", TYPE]]);
    expect(nodes[3]!.parameters?.text).toEqual({ $state: { path: "$node.s3.value.label" } });
    expect(assembled.draftStepIdByNodeKey).toMatchObject({ s3: "d34", s4: "d35" });
    const validated = validateAutomationStudioFlowBootstrapPlan({ plan: assembled.plan!, registry, resolution });
    expect(validated.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("reads a step before a repeat from inside it, and a member of a repeat from a later member", () => {
    const assembled = assemble([
      step(1, "d1", READ, { selector: "#heading" }),
      step(2, "d2", LIST, { extractList: { item: ".row", fields: { name: ".name" } } }),
      step(3, "d3", READ, { selector: ".row-name" }, { routing: { kind: "repeat", over: "d2", through: "d4" } }),
      step(4, "d4", TYPE, { selector: ".row-field", text: earlier("d3", "value", "label"), expectedState: { conditions: [{ kind: "text", selector: "#heading", expected: earlier("d1", "value") }] } })
    ]);
    expect(errors(assembled)).toEqual([]);
    const typed = assembled.plan!.subflows[0]!.nodes.find((node) => node.definitionId === TYPE)!;
    const keyOf = (id: string) => Object.entries(assembled.draftStepIdByNodeKey!).find(([, stepId]) => stepId === id)![0];
    expect(typed.parameters?.text).toEqual({ $state: { path: `$node.${keyOf("d3")}.value.label` } });
    expect(typed.parameters?.expectedState).toEqual({ conditions: [{ kind: "text", selector: "#heading", expected: { $state: { path: `$node.${keyOf("d1")}.value` } } }] });
  });

  it("is refused when the step it reads is not in the Flow", () => {
    const assembled = assemble([step(1, "d1", READ, { selector: "#name" }, { disposition: "dropped" }), step(2, "d2", TYPE, { selector: "#copy", text: earlier("d1", "value") })]);
    expect(assembled.plan).toBeUndefined();
    expect(codes(assembled)).toEqual([["flow_draft.step_binding_source_missing", "draft.steps.2"]]);
    expect(errors(assembled)[0]!.message).toContain("Step 2");
  });

  it("is refused when a step carries a node reference from a saved Flow untranslated: its key named another plan's node", () => {
    const assembled = assemble([step(1, "d1", READ, { selector: "#name" }), step(2, "f2", TYPE, { selector: "#copy", text: { $state: { path: "$node.s1.value" } } })]);
    expect(codes(assembled)).toEqual([["flow_draft.step_binding_source_missing", "draft.steps.2"]]);
  });

  it("is refused when the step it reads runs after it, or is itself: a reorder moved it away", () => {
    const later = assemble([step(1, "d2", TYPE, { selector: "#copy", text: earlier("d1", "value") }), step(2, "d1", READ, { selector: "#name" })]);
    expect(codes(later)).toEqual([["flow_draft.step_binding_not_earlier", "draft.steps.1"]]);
    const self = assemble([step(1, "d1", READ, { selector: earlier("d1", "value") })]);
    expect(codes(self)).toEqual([["flow_draft.step_binding_not_earlier", "draft.steps.1"]]);
  });

  it("is refused when the step's node declares no such output", () => {
    const assembled = assemble([step(1, "d1", CLICK, { selector: "#name" }), step(2, "d2", TYPE, { selector: "#copy", text: earlier("d1", "value") })]);
    expect(codes(assembled)).toEqual([["flow_draft.step_binding_unknown_output", "draft.steps.2"]]);
  });

  it("is refused when the Flow does not always run the step it reads", () => {
    const assembled = assemble([
      step(1, "d1", READ, { selector: "#banner" }, { routing: { kind: "optional" } }),
      step(2, "d2", TYPE, { selector: "#copy", text: earlier("d1", "value") })
    ]);
    expect(codes(assembled)).toEqual([["flow_draft.step_binding_conditional_source", "draft.steps.2"]]);
  });

  it("is refused when it reads a step of a repeat from outside that repeat: which pass it would read is no one's choice", () => {
    const assembled = assemble([
      step(1, "d2", LIST, { extractList: { item: ".row", fields: { name: ".name" } } }),
      step(2, "d3", READ, { selector: ".row-name" }, { routing: { kind: "repeat", over: "d2", through: "d3" } }),
      step(3, "d4", TYPE, { selector: "#after", text: earlier("d3", "value") })
    ]);
    expect(codes(assembled)).toEqual([["flow_draft.step_binding_repeated_source", "draft.steps.3"]]);
  });

  it("leaves no earlier-output binding unrewritten in an assembled plan", () => {
    const assembled = assemble([step(1, "d1", READ, { selector: "#name" }), step(2, "d2", TYPE, { selector: "#copy", text: earlier("d1", "value"), expectedState: { conditions: [{ kind: "text", selector: "#copy", expected: earlier("d1", "value", "label") }] } })]);
    expect(JSON.stringify(assembled.plan)).not.toContain("$step.");
  });
});
