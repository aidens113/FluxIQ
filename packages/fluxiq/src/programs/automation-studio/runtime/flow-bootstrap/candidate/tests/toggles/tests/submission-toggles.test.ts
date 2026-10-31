// t775: builds stop putting the site back before a trial, so a submitted step on
// a control the build explored as a toggle must be safe to run again. A plain
// press of it is given Core's `ensureState`, also where the domain named a node that
// sets the state, since a press node that takes the state is its idempotent form (t799).

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../../../nodes/index.ts";
import { AutomationStudioExploredToggles } from "../../../../explored-toggles.ts";
import { AutomationStudioFlowCandidateSubmissionController } from "../../../index.ts";

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.press", version: "1.0.0", label: "Press", description: "Press one control", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "press" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "target", label: "Target", valueType: "object", required: true }, { id: "ensureState", label: "Ensure state", valueType: "object" }]
};
const registry = new AutomationStudioNodeRegistry([definition]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };
/** Each handle's control; `t2` is another view's handle for the control `t1` names. */
const SELECTORS: Record<string, string> = { t1: "#setting", t2: "#setting", t3: "#other" };

/** A domain that resolves every handle a view printed, keeps a written `ensureState`, and asks no permission. */
const binding = {
  resolvePlanNodeParameters: async ({ parameters }: { parameters: JsonObject }) => {
    const handle = String((parameters.target as JsonObject).handle);
    return {
      status: "resolved" as const,
      parameters: { target: { selector: SELECTORS[handle]! }, ...(parameters.ensureState !== undefined ? { ensureState: parameters.ensureState } : {}) },
      handleViews: [{ handle, view: 1, location: "https://site.test/" }]
    };
  }
};

function candidate(steps: Array<{ handle: string; consequences: string[]; ensureState?: JsonObject }>): JsonObject {
  const nodes = steps.map((step, index) => ({ key: `n${index}`, definitionId: definition.id, definitionVersion: definition.version, consequences: step.consequences, parameters: { target: { handle: step.handle }, ...(step.ensureState ? { ensureState: step.ensureState } : {}) } }));
  const edges = nodes.slice(1).map((node, index) => ({ key: `e${index}`, source: { nodeKey: nodes[index]!.key, portId: "success" }, target: { nodeKey: node.key, portId: "in" } }));
  return { summary: "Change the setting", plan: { schemaVersion: "0.1", router: { name: "Change", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges }] } };
}

/** The build's record after one explored press of `handle` the domain answered as a toggle. */
function explored(handle: string, toggle: JsonObject): AutomationStudioExploredToggles {
  const toggles = new AutomationStudioExploredToggles();
  toggles.explored(
    { callId: "press.1", toolId: "core.run_node", value: { node: definition.id, parameters: { target: { handle } }, consequences: ["modify_existing"] } },
    { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, outputs: { toggle }, draft: { actionId: definition.id, ranWith: { node: definition.id, parameters: { target: { selector: SELECTORS[handle] } } } } }
  );
  return toggles;
}

const controller = (exploredToggles?: AutomationStudioExploredToggles) => new AutomationStudioFlowCandidateSubmissionController({
  projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding, ...(exploredToggles ? { exploredToggles } : {})
});

const SIGNATURE = { state: "opaque.state.1" };

describe("a submitted step on a control explored as a toggle", () => {
  it("is given ensureState, the explored press's signature, when it repeats that press as a plain modify_existing press", async () => {
    const submitted = await controller(explored("t1", { signature: SIGNATURE })).submit(candidate([{ handle: "t1", consequences: ["modify_existing"] }, { handle: "t3", consequences: ["modify_existing"] }]));
    expect(submitted.ok, JSON.stringify(submitted)).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.candidate.buildPlan.plan.subflows[0]!.nodes.map((node) => node.parameters)).toEqual([
      { target: { selector: "#setting" }, ensureState: SIGNATURE },
      // Another control: an ordinary press.
      { target: { selector: "#other" } }
    ]);
  });

  it("is tied to the press by its resolved target too, when the model copied another view's handle for it", async () => {
    const submitted = await controller(explored("t1", { signature: SIGNATURE })).submit(candidate([{ handle: "t2", consequences: ["modify_existing"] }]));
    expect(submitted.ok && submitted.candidate.buildPlan.plan.subflows[0]!.nodes[0]!.parameters?.ensureState).toEqual(SIGNATURE);
  });

  it("is given ensureState in place of a refusal when the domain named a node that sets the state and the press takes the state (t799)", async () => {
    const submitted = await controller(explored("t1", { signature: SIGNATURE, idempotentWith: "domain.demo.set_state" })).submit(candidate([{ handle: "t1", consequences: ["modify_existing"] }]));
    expect(submitted.ok, JSON.stringify(submitted)).toBe(true);
    expect(submitted.ok && submitted.candidate.buildPlan.plan.subflows[0]!.nodes[0]!.parameters).toEqual({ target: { selector: "#setting" }, ensureState: SIGNATURE });
  });

  it("is left alone when it declares anything but exactly modify_existing", async () => {
    for (const consequences of [[], ["create_new"], ["modify_existing", "delete"]]) {
      const submitted = await controller(explored("t1", { signature: SIGNATURE, idempotentWith: "domain.demo.set_state" })).submit(candidate([{ handle: "t1", consequences }]));
      expect(submitted.ok, JSON.stringify(consequences)).toBe(true);
      if (submitted.ok) expect(submitted.candidate.buildPlan.plan.subflows[0]!.nodes[0]!.parameters).toEqual({ target: { selector: "#setting" } });
    }
  });

  it("never keeps an ensureState the model wrote itself", async () => {
    const submitted = await controller().submit(candidate([{ handle: "t1", consequences: ["modify_existing"], ensureState: { state: "made.up" } }]));
    expect(submitted.ok && submitted.candidate.buildPlan.plan.subflows[0]!.nodes[0]!.parameters).toEqual({ target: { selector: "#setting" } });
  });
});
