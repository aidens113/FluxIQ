// t799 (w7): a headed run's trial closed a named overlay and the next submission had no handler. The chain from
// the attempt to the submitted plan: the layer as Core parses a client's report that carries a definition and a
// target and no way-out token (the parse itself: `../../../executor/node-execution/tests/cleared-layers.test.ts`),
// put on a trial attempt, recorded, lowered. `controlRef` is the parameters the press runs with (web: `{ selector, element }`).

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioClearedLayer, AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioFlowCandidateSubmissionController } from "../../candidate/index.ts";
import { AutomationStudioExploredInterruptions } from "../../explored-interruptions.ts";
import type { AutomationStudioFlowBuildPlan } from "../../plan/index.ts";
import { automationStudioCandidateExploredLayerHandlers } from "../index.ts";

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.archive.click", version: "1.0.0", label: "Click", description: "Click one control", category: "action",
  source: { kind: "importer", domainId: "archive", implementationKey: "click" }, availability: { kind: "domain", domainId: "archive" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any", role: "success" }, { id: "failed", label: "Failed", valueType: "any", role: "failure" }],
  parameters: [{ id: "selector", label: "Selector", valueType: "string", required: true }, { id: "element", label: "Element", valueType: "object" }]
};
const registry = new AutomationStudioNodeRegistry().register(definition);
const resolution = { scope: { kind: "domain" as const, domainId: "archive" }, runtimeCapabilities: [], permissions: [] };
const controlRef = { selector: "dialog[aria-label='Library card offer'] button.close", element: { tagName: "button", selector: "button.close", accessibleName: "Close", role: "button", context: { dialog: "Library card offer" } } };
const layer: AutomationStudioClearedLayer = { kind: "overlay", control: "Close", id: "layer:3f9a1c2e", name: "Library card offer", wayOutDefinitionId: definition.id, controlRef };

function recorded(): AutomationStudioExploredInterruptions {
  const record = new AutomationStudioExploredInterruptions();
  const attempt = { nodeId: "open", status: "succeeded", clearedLayers: [layer] } as unknown as AutomationStudioNodeAttemptTrace;
  record.trial([attempt]);
  return record;
}

function plan(): JsonObject {
  const nodes = [{ key: "n0", definitionId: definition.id, definitionVersion: definition.version, consequences: [], parameters: { selector: "#borrow" } }];
  return { schemaVersion: "0.1", router: { name: "Borrow", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges: [] }] };
}

describe("a layer a trial closed, from the client's payload to the submitted plan", () => {
  it("is recorded from a payload that carries a definition and a target and no wayOut token", () => {
    expect(recorded().list()).toEqual([{ kind: "trial_close", id: "layer:3f9a1c2e", name: "Library card offer", wayOutDefinitionId: definition.id, controlRef }]);
  });

  it("becomes a handler on the obstruction fact pressing the definition with the target", () => {
    // Only `plan` is read by the lowering; the rest of a validated plan is typed through `unknown`.
    const base = { plan: plan(), risk: { level: "low" }, subflows: [] } as unknown as AutomationStudioFlowBuildPlan;
    const built = automationStudioCandidateExploredLayerHandlers({ buildPlan: base, explored: recorded().list(), registry, resolution });
    expect(built).not.toBe(base);
    const nodes = built.plan.subflows[0]!.nodes;
    const handler = nodes.find((node) => node.definitionId === "builtin.control.handler")!;
    expect(handler.parameters).toMatchObject({ when: [{ fact: "obstruction", op: "visible", value: "Library card offer" }] });
    const press = nodes[nodes.indexOf(handler) + 1]!;
    expect(press).toMatchObject({ definitionId: definition.id, consequences: [] });
    expect(press.parameters).toEqual(controlRef); // the parameters the press runs with, not a `target` holding them
  });

  it("is in the plan the submission controller submits", async () => {
    const binding = { resolvePlanNodeParameters: async () => ({ status: "resolved" as const, parameters: { selector: "#borrow" }, handleViews: [{ handle: "t10", view: 1, location: "https://archive.test/" }] }) };
    const controller = new AutomationStudioFlowCandidateSubmissionController({ projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding, exploredInterruptions: recorded() });
    const nodes = [{ key: "n0", definitionId: definition.id, definitionVersion: definition.version, consequences: [], parameters: { selector: { handle: "t10" } } }];
    const answer = await controller.submit({ summary: "Borrow", plan: { ...plan(), subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges: [] }] } });
    if (!answer.ok) throw new Error(JSON.stringify(answer));
    const submitted = answer.candidate.buildPlan.plan.subflows[0]!.nodes;
    const handler = submitted.find((node) => node.definitionId === "builtin.control.handler");
    expect(handler?.parameters).toMatchObject({ when: [{ fact: "obstruction", op: "visible", value: "Library card offer" }] });
  });
});
