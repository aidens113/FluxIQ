// A Flow node is named by what its draft step did, in the domain's words
// (R3-U-12, live round 3 lane C): playback's read card said only "Read list"
// while the build's cards said "Read list · name, price and 4 more". A run
// names a step by its node's label or its parameters (`../../activity/step/`),
// and a read's parameters say nothing a person reads. So the step's described
// name (`does.target`, the draft step's `words`) is carried from the draft step,
// through the plan and its validation, onto the Flow node's `label`.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../nodes/index.ts";
import { createBlankAutomationStudioFlowArtifact } from "../../../model/index.ts";
import type { AutomationStudioFlowDraftStep, AutomationStudioFlowDraftStepRouting } from "../../flow-draft/index.ts";
import { webDomainNodeDefinitionsFixture } from "../plan/tests/index.ts";
import {
  assembleAutomationStudioFlowDraftPlan,
  normalizeAutomationStudioFlowBuildPlan,
  parseAutomationStudioFlowBootstrapPlan,
  validateAutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBuildPlan,
  type AutomationStudioFlowDraftWrittenStep
} from "../index.ts";

const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };

const step = (position: number, actionId: string, target: string | undefined, routing?: AutomationStudioFlowDraftStepRouting): AutomationStudioFlowDraftStep => ({
  position, id: `d${position}`, iteration: position, callId: `call.${position}`, actionId, input: { target: `#s${position}` },
  effect: actionId === "read" ? "observe" : "mutate", effectApplied: true, disposition: "kept",
  ...(target === undefined ? {} : { words: { target } }),
  ...(routing ? { routing } : {})
});

const write = (draftStep: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep => draftStep.actionId === "read"
  ? { description: "read the rows", node: "web.output.dom-extract_list", entries: [{ key: "extractList", value: JSON.stringify({ item: ".row", fields: { name: ".name" } }) }] }
  : { description: "press the control", node: "web.output.dom-click", entries: [{ key: "selector", value: String(draftStep.input.target) }] };

function assembled(steps: AutomationStudioFlowDraftStep[]) {
  const result = assembleAutomationStudioFlowDraftPlan({ steps, write, registry, resolution, summary: "Read the requests" });
  if (!result.plan) throw new Error(`expected a plan: ${result.issues.map((issue) => issue.code).join(", ")}`);
  return result;
}

/** Each node a draft step became, by that step's id, with its label. */
function labelsByStep(steps: AutomationStudioFlowDraftStep[]): Record<string, string | undefined> {
  const result = assembled(steps);
  const byKey = new Map(result.plan!.subflows[0]!.nodes.map((node) => [node.key, node.label]));
  return Object.fromEntries(Object.entries(result.draftStepIdByNodeKey ?? {}).map(([key, stepId]) => [stepId, byKey.get(key)]));
}

describe("a Flow node named by what its draft step did", () => {
  it("labels each node with its step's described name, and leaves a step with none unlabelled", () => {
    expect(labelsByStep([step(1, "press", "Decline"), step(2, "read", "name, price and 4 more"), step(3, "press", undefined)])).toEqual({
      d1: "Decline",
      d2: "name, price and 4 more",
      d3: undefined
    });
  });

  it("does not name a step a list repeat runs once per row after the one row the build explored", () => {
    const steps = [step(1, "read", "the requests"), step(2, "press", "Confirm · Jonas", { kind: "repeat", through: "d2", over: "d1" })];
    expect(labelsByStep(steps)).toEqual({ d1: "the requests", d2: undefined });
  });

  it("keeps the label through parsing and validation, and writes it on the Flow node", () => {
    const plan = assembled([step(1, "read", "name, price and 4 more")]).plan!;
    expect(parseAutomationStudioFlowBootstrapPlan(JSON.parse(JSON.stringify(plan))).issues).toEqual([]);
    const validated = validateAutomationStudioFlowBootstrapPlan({ plan, registry, resolution });
    if (!validated.validated) throw new Error(`expected a valid plan: ${validated.issues.map((issue) => issue.code).join(", ")}`);
    const buildPlan = JSON.parse(JSON.stringify(validated.validated)) as AutomationStudioFlowBuildPlan;
    const topology = normalizeAutomationStudioFlowBuildPlan({
      adaptationId: "adaptation.bootstrap.7d0c3e1a-5b2f-4a8e-9c6d-1e2f3a4b5c6d",
      parentFlow: createBlankAutomationStudioFlowArtifact({ flowId: "flow.store", projectId: "project.demo", name: "Store", now: 1 }),
      buildPlan, sourceInstructionIds: ["instruction.1"], now: 1
    });
    expect(topology.subflows[0]!.graphFlow.nodes.map((node) => node.label)).toEqual(["name, price and 4 more"]);
  });
});
