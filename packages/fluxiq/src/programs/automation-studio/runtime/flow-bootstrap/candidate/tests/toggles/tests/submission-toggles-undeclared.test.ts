// t775-P: a step is given `ensureState` only when its node declares it. The
// candidate's plan is validated again before its trial runs, and validation
// resolves a key a node does not declare to its nearest declared one
// (`plan/name-correction.ts`). On the photo-social like loop the web domain's
// press did not declare `ensureState`, so Core's signature arrived at the trial
// as the press's `expectedState`, the press ran plainly, and the trial unliked
// the post exploration had liked.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../../../nodes/index.ts";
import { AutomationStudioExploredToggles } from "../../../../explored-toggles.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../../../plan/index.ts";
import { AutomationStudioFlowCandidateSubmissionController } from "../../../index.ts";

/** A press whose definition declares `expectedState` and, only where asked, `ensureState`, as the web press now does. */
function press(declaresEnsureState: boolean): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id: "domain.demo.press", version: "1.0.0", label: "Press", description: "Press one control", category: "action",
    source: { kind: "importer", domainId: "demo", implementationKey: "press" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
    inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [
      { id: "target", label: "Target", valueType: "object", required: true },
      { id: "expectedState", label: "Expected State", valueType: "object" },
      ...(declaresEnsureState ? [{ id: "ensureState", label: "Ensure state", valueType: "object" as const, shownToModel: false as const }] : [])
    ]
  };
}
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };
const binding = {
  resolvePlanNodeParameters: async ({ parameters }: { parameters: JsonObject }) => ({
    status: "resolved" as const,
    parameters: { target: { selector: "#like" }, ...(parameters.ensureState ? { ensureState: parameters.ensureState } : {}) },
    handleViews: [{ handle: String((parameters.target as JsonObject).handle), view: 1, location: "https://site.test/p/1/" }]
  })
};
/** The web press's own word for "now shows Unlike, no longer Like". */
const SIGNATURE = { via: "name", gains: ["unlike"], loses: ["like"] };

function explored(): AutomationStudioExploredToggles {
  const toggles = new AutomationStudioExploredToggles();
  // As the web domain answers a press: `toggle` on the evidence the model is shown.
  toggles.explored(
    { callId: "first.like", toolId: "core.run_node", value: { node: "domain.demo.press", parameters: { target: { handle: "t542" } }, consequences: ["modify_existing"] } },
    { kind: "llm_evidence_tool_execution", evidence: { ok: true, toggle: { signature: SIGNATURE } }, effectApplied: true, draft: { actionId: "domain.demo.press", ranWith: { parameters: { target: { selector: "#like" } } } } }
  );
  return toggles;
}

async function submitted(declaresEnsureState: boolean) {
  const registry = new AutomationStudioNodeRegistry([press(declaresEnsureState)]);
  const controller = new AutomationStudioFlowCandidateSubmissionController({ projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding, exploredToggles: explored() });
  const nodes = [{ key: "like", definitionId: "domain.demo.press", definitionVersion: "1.0.0", consequences: ["modify_existing"], parameters: { target: { handle: "t542" }, ...(declaresEnsureState ? { ensureState: SIGNATURE } : {}) } }];
  const result = await controller.submit({ summary: "Like the posts", plan: { schemaVersion: "0.1", router: { name: "Like", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges: [] }] } });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("refused");
  // What the trial runs: the candidate's plan, validated again (`verification/detached-execution.ts`).
  const validated = validateAutomationStudioFlowBootstrapPlan({ plan: result.candidate.buildPlan.plan, registry, resolution });
  expect(validated.ok, JSON.stringify(validated.issues)).toBe(true);
  return validated.validated!.plan.subflows[0]!.nodes[0]!.parameters;
}

describe("a toggle step's ensureState, as the trial runs it", () => {
  it("reaches the trial as ensureState when the press declares it", async () => {
    expect(await submitted(true)).toEqual({ target: { selector: "#like" }, ensureState: SIGNATURE });
  });

  it("preserves the existing no-ensureState node path without correcting it to expectedState", async () => {
    const parameters = await submitted(false);
    expect(parameters).toEqual({ target: { selector: "#like" } });
    expect(parameters?.expectedState).toBeUndefined();
  });
});
