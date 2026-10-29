// t787 (fix 3 of `run-mvskptb1-c9cef4fe`): a toggle step's `ensureState` must
// reach the graph a trial runs and a promotion saves, not only the plan. Both
// are built from the build plan's laid-out `subflows`
// (`normalizeAutomationStudioFlowBuildPlan`), and a trial refuses a candidate
// whose `plan` re-validates to other `subflows` (`candidate.execution_plan_rewritten`,
// `../../../../verification/detached-execution.ts`). A step whose only press of
// its control came from a trial pass of the same node is the case the live run
// lacked: its handle was never pressed while exploring.

import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { createBlankAutomationStudioFlowArtifact } from "../../../../../../model/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../../../nodes/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../../../executor/index.ts";
import { normalizeAutomationStudioFlowBuildPlan } from "../../../../adaptation.ts";
import { AutomationStudioExploredToggles } from "../../../../explored-toggles.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBuildPlan } from "../../../../plan/index.ts";
import { AutomationStudioFlowCandidateSubmissionController } from "../../../index.ts";

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.press", version: "1.0.0", label: "Press", description: "Press one control", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "press" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "target", label: "Target", valueType: "object", required: true }, { id: "ensureState", label: "Ensure state", valueType: "object" }]
};
const registry = new AutomationStudioNodeRegistry([definition]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };

/** A domain that resolves every handle, keeps a written `ensureState`, and asks no permission. */
const binding = {
  resolvePlanNodeParameters: async ({ parameters }: { parameters: JsonObject }) => {
    const handle = String((parameters.target as JsonObject).handle);
    return {
      status: "resolved" as const,
      parameters: { target: { selector: `#${handle}` }, ...(parameters.ensureState !== undefined ? { ensureState: parameters.ensureState } : {}) },
      handleViews: [{ handle, view: 1, location: "https://site.test/" }]
    };
  }
};

/** One part, `primary`, pressing `t9` (a handle never pressed while exploring) then `t3`. */
function candidate(ensureState?: JsonObject): JsonObject {
  const nodes = ["t9", "t3"].map((handle, index) => ({ key: `n${index}`, definitionId: definition.id, definitionVersion: definition.version, consequences: ["modify_existing"],
    parameters: { target: { handle }, ...(ensureState && index === 0 ? { ensureState } : {}) } }));
  return { summary: "Change the setting", plan: { schemaVersion: "0.1", router: { name: "Change", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges: [{ key: "e0", source: { nodeKey: "n0", portId: "success" }, target: { nodeKey: "n1", portId: "in" } }] }] } };
}

/** A trial's executed attempt of the graph node `nodeId` (`primary.n0`) that the domain answered as a toggle. */
function trialPress(signature: JsonObject, nodeId: string): AutomationStudioNodeAttemptTrace {
  return { attemptId: "attempt.1", nodeId, definitionId: definition.id, startedAt: 1, finishedAt: 2, status: "succeeded",
    inputs: {}, outputs: { toggle: { signature } }, effects: [] };
}

const controller = (exploredToggles?: AutomationStudioExploredToggles) => new AutomationStudioFlowCandidateSubmissionController({
  projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding, ...(exploredToggles ? { exploredToggles } : {})
});

/** The graph nodes' parameters, by plan key, as a trial runs them and a promotion saves them. */
function graphParameters(buildPlan: AutomationStudioFlowBuildPlan): Record<string, unknown> {
  return Object.fromEntries(graphOf(buildPlan).nodes.map((node) => [String(node.id).split(".").at(-1), node.parameterValues]));
}

/** The graph a trial of `buildPlan` runs, as a trial hands it to the build's toggles (t792). */
function graphOf(buildPlan: AutomationStudioFlowBuildPlan) {
  const parentFlow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.test", projectId: "project.test", name: "Test", now: 1 });
  return normalizeAutomationStudioFlowBuildPlan({ adaptationId: "candidate.test", parentFlow, buildPlan, sourceInstructionIds: [], now: 1 }).subflows[0]!.graphFlow;
}

/** Whether a trial would run the plan as submitted: its plan re-validates to the same laid-out parts. */
function runsAsSubmitted(buildPlan: AutomationStudioFlowBuildPlan): boolean {
  const validation = validateAutomationStudioFlowBootstrapPlan({ plan: buildPlan.plan, registry, resolution });
  return Boolean(validation.ok && validation.validated && isDeepStrictEqual(validation.validated.plan, buildPlan.plan) && isDeepStrictEqual(validation.validated.subflows, buildPlan.subflows));
}

const SIGNATURE = { state: "opaque.state.trial" };

describe("a toggle step's ensureState in the graph that is run and saved", () => {
  it("reaches the graph of the next revision once a trial pass of the same node was answered as a toggle", async () => {
    const toggles = new AutomationStudioExploredToggles();
    const submissions = controller(toggles);
    const first = await submissions.submit(candidate());
    expect(first.ok, JSON.stringify(first)).toBe(true);
    if (!first.ok) return;
    expect(graphParameters(first.candidate.buildPlan).n0).toEqual({ target: { selector: "#t9" } });

    // The trial pressed `primary.n0`, and the domain said that press flipped its control; the trial's graph says how that step was written.
    const ran = graphOf(first.candidate.buildPlan);
    toggles.trial([trialPress(SIGNATURE, ran.nodes.find((node) => String(node.id).endsWith(".primary.n0"))!.id)], ran);
    const second = await submissions.submit(candidate());
    expect(second.ok, JSON.stringify(second)).toBe(true);
    if (!second.ok) return;
    expect(second.candidate.revision).toBeGreaterThan(first.candidate.revision);
    expect(second.candidate.buildPlan.plan.subflows[0]!.nodes[0]!.parameters?.ensureState).toEqual(SIGNATURE);
    // The laid-out part a graph is built from carries it too, and the trial's rewrite guard passes.
    expect(second.candidate.buildPlan.subflows[0]!.nodes[0]!.parameters?.ensureState).toEqual(SIGNATURE);
    expect(runsAsSubmitted(second.candidate.buildPlan)).toBe(true);
    const graph = graphParameters(second.candidate.buildPlan);
    expect(graph.n0).toEqual({ target: { selector: "#t9" }, ensureState: SIGNATURE });
    // Another control of the same node is an ordinary press.
    expect(graph.n1).toEqual({ target: { selector: "#t3" } });
  });

  it("never keeps an ensureState the model wrote in the graph either", async () => {
    const submitted = await controller().submit(candidate({ state: "made.up" }));
    expect(submitted.ok, JSON.stringify(submitted)).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.candidate.buildPlan.subflows[0]!.nodes[0]!.parameters).toEqual({ target: { selector: "#t9" } });
    expect(runsAsSubmitted(submitted.candidate.buildPlan)).toBe(true);
    expect(graphParameters(submitted.candidate.buildPlan).n0).toEqual({ target: { selector: "#t9" } });
  });
});
