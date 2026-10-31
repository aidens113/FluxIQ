// t799: a handler the plan's check refuses is left out alone and named; the others stay, and the submission says so.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioClearedLayer, AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioFlowCandidateSubmissionController } from "../../candidate/index.ts";
import { AutomationStudioExploredInterruptions } from "../../explored-interruptions.ts";
import type { AutomationStudioFlowBuildPlan } from "../../plan/index.ts";
import { automationStudioCandidateExploredLayerHandlers, automationStudioDroppedLayerHandlerAdvice, type AutomationStudioDroppedLayerHandler } from "../index.ts";

function press(id: string, required: string[]): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id, version: "1.0.0", label: "Press", description: "Press one control", category: "action",
    source: { kind: "importer", domainId: "archive", implementationKey: id }, availability: { kind: "domain", domainId: "archive" }, capabilities: { executable: true },
    inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any", role: "success" }, { id: "failed", label: "Failed", valueType: "any", role: "failure" }],
    parameters: ["selector", "label"].map((name) => ({ id: name, label: name, valueType: "string" as const, required: required.includes(name) }))
  };
}
const SIMPLE = press("domain.archive.press", ["selector"]);
const STRICT = press("domain.archive.press-labelled", ["selector", "label"]);
const registry = new AutomationStudioNodeRegistry().register(SIMPLE).register(STRICT);
const resolution = { scope: { kind: "domain" as const, domainId: "archive" }, runtimeCapabilities: [], permissions: [] };

const layer = (name: string, definition: AutomationStudioNodeDefinition, controlRef: JsonObject): AutomationStudioClearedLayer => ({ kind: "other", control: "Close", name, wayOutDefinitionId: definition.id, controlRef });
const GOOD = layer("Library card offer", SIMPLE, { selector: "#card-offer .close" });
const BAD = layer("Archive newsletter panel", STRICT, { selector: "#newsletter .close" }); // lacks the required `label`

function recorded(layers: AutomationStudioClearedLayer[]): AutomationStudioExploredInterruptions {
  const record = new AutomationStudioExploredInterruptions();
  record.trial([{ nodeId: "open", status: "succeeded", clearedLayers: layers } as unknown as AutomationStudioNodeAttemptTrace]);
  return record;
}

function plan(): JsonObject {
  const nodes = [{ key: "n0", definitionId: SIMPLE.id, definitionVersion: SIMPLE.version, consequences: [], parameters: { selector: "#borrow" } }];
  return { schemaVersion: "0.1", router: { name: "Borrow", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges: [] }] };
}

const handlerNames = (built: AutomationStudioFlowBuildPlan) => built.plan.subflows[0]!.nodes.filter((node) => node.definitionId === "builtin.control.handler").map((node) => JSON.stringify(node.parameters?.when));

describe("a handler the plan's check refuses", () => {
  it("is left out and named, while the other handlers stay", () => {
    const base = { plan: plan(), risk: { level: "low" }, subflows: [] } as unknown as AutomationStudioFlowBuildPlan;
    const dropped: AutomationStudioDroppedLayerHandler[] = [];
    const built = automationStudioCandidateExploredLayerHandlers({ buildPlan: base, explored: recorded([BAD, GOOD]).list(), registry, resolution, dropped });
    expect(built).not.toBe(base);
    expect(handlerNames(built)).toHaveLength(1);
    expect(handlerNames(built)[0]).toContain("Library card offer");
    expect(dropped).toEqual([{ layer: "Archive newsletter panel", code: "bootstrap.missing_parameter" }]);
  });

  it("leaves a plan valid without handlers as it was when every handler is refused", () => {
    const base = { plan: plan(), risk: { level: "low" }, subflows: [] } as unknown as AutomationStudioFlowBuildPlan;
    const dropped: AutomationStudioDroppedLayerHandler[] = [];
    expect(automationStudioCandidateExploredLayerHandlers({ buildPlan: base, explored: recorded([BAD]).list(), registry, resolution, dropped })).toBe(base);
    expect(dropped).toHaveLength(1);
  });

  it("is said in one advice line in generic words, naming the layer and the code", () => {
    const [line, ...rest] = automationStudioDroppedLayerHandlerAdvice([{ layer: "Archive newsletter panel", code: "bootstrap.missing_parameter" }]);
    expect(rest).toEqual([]);
    expect(line).toContain("\"Archive newsletter panel\" (bootstrap.missing_parameter)");
    expect(automationStudioDroppedLayerHandlerAdvice([])).toEqual([]);
  });

  it("reaches the submission's advice, beside the handler that stayed", async () => {
    const binding = { resolvePlanNodeParameters: async () => ({ status: "resolved" as const, parameters: { selector: "#borrow" }, handleViews: [{ handle: "t10", view: 1, location: "https://archive.test/" }] }) };
    const controller = new AutomationStudioFlowCandidateSubmissionController({ projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding, exploredInterruptions: recorded([BAD, GOOD]) });
    const nodes = [{ key: "n0", definitionId: SIMPLE.id, definitionVersion: SIMPLE.version, consequences: [], parameters: { selector: { handle: "t10" } } }];
    const answer = await controller.submit({ summary: "Borrow", plan: { ...plan(), subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges: [] }] } });
    if (!answer.ok) throw new Error(JSON.stringify(answer));
    expect(answer.candidate.buildPlan.plan.subflows[0]!.nodes.filter((node) => node.definitionId === "builtin.control.handler")).toHaveLength(1);
    expect(answer.advice?.some((line) => line.includes("Archive newsletter panel") && line.includes("bootstrap.missing_parameter"))).toBe(true);
  });
});
