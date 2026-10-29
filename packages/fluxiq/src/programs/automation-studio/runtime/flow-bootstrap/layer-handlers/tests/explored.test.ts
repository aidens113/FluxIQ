// P6 (t796): a layer cleared while exploring always gets a handler in the
// submitted Flow, whether or not a step of the Flow also presses its control.
// The model's own press of the control is an ordinary step; on a later pass the
// site remembers the layer closed, and only the handler answers it wherever it
// shows again.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioFlowCandidateSubmissionController } from "../../candidate/index.ts";
import { AutomationStudioExploredInterruptions } from "../../explored-interruptions.ts";

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.archive.press", version: "1.0.0", label: "Press", description: "Press one control", category: "action",
  source: { kind: "importer", domainId: "archive", implementationKey: "press" }, availability: { kind: "domain", domainId: "archive" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any", role: "success" }, { id: "failed", label: "Failed", valueType: "any", role: "failure" }],
  parameters: [{ id: "target", label: "Target", valueType: "object", required: true }]
};
const registry = new AutomationStudioNodeRegistry().register(definition);
const resolution = { scope: { kind: "domain" as const, domainId: "archive" }, runtimeCapabilities: [], permissions: [] };
/** `t10` the Check-out button the help panel covers, `t20` the help panel's close control. */
const SELECTORS: Record<string, string> = { t10: "#check-out", t20: "#help .close" };
const CLOSE = { target: { selector: SELECTORS.t20! } };

const binding = {
  resolvePlanNodeParameters: async ({ parameters }: { parameters: JsonObject }) => {
    const handle = String((parameters.target as JsonObject).handle);
    return { status: "resolved" as const, parameters: { target: { selector: SELECTORS[handle]! } }, handleViews: [{ handle, view: 1, location: "https://archive.test/" }] };
  }
};

const PRESS = (handle: string): JsonObject => ({ node: definition.id, parameters: { target: { handle } }, consequences: [] });

function explored(): AutomationStudioExploredInterruptions {
  const record = new AutomationStudioExploredInterruptions();
  record.explored({ callId: "close.1", toolId: "core.run_node", value: PRESS("t20") }, {
    kind: "llm_evidence_tool_execution", effectApplied: true,
    evidence: { ok: true, layerCleared: { signature: { layer: { tag: "aside" }, control: { tag: "button" } }, control: "t20" } },
    draft: { actionId: definition.id, ranWith: { node: definition.id, parameters: CLOSE } }
  });
  return record;
}

function candidate(handles: string[]): JsonObject {
  const nodes = handles.map((handle, index) => ({ key: `n${index}`, definitionId: definition.id, definitionVersion: definition.version, consequences: [], parameters: { target: { handle } } }));
  const edges = nodes.slice(1).map((node, index) => ({ key: `e${index}`, source: { nodeKey: nodes[index]!.key, portId: "success" }, target: { nodeKey: node.key, portId: "in" } }));
  return { summary: "Check out", plan: { schemaVersion: "0.1", router: { name: "Check out", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges }] } };
}

describe("a layer cleared while exploring", () => {
  it("a cleared layer gets a handler even when a step also presses its control", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController({
      projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding, exploredInterruptions: explored()
    });
    // The Flow's own first step presses the panel's close control, then it checks out.
    const answer = await controller.submit(candidate(["t20", "t10"]));
    if (!answer.ok) throw new Error(JSON.stringify(answer));
    const nodes = answer.candidate.buildPlan.plan.subflows[0]!.nodes;
    expect(nodes.map((node) => node.definitionId)).toEqual([definition.id, definition.id, "builtin.control.handler", definition.id, "builtin.control.handler-end"]);
    const handler = nodes.find((node) => node.definitionId === "builtin.control.handler")!;
    expect(handler.parameters).toMatchObject({ scope: { kind: "subflow", inherit: false }, when: [{ fact: "visible", op: "visible", target: CLOSE }], completionCheck: [{ fact: "visible", op: "equals", value: false, target: CLOSE }] });
  });
});
