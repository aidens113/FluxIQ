// A pace a trial learned is written by Core on the next submission (P6, CC8,
// t799): the step is tied by its identity (node and parameters), never its key;
// the pace is rounded up to a whole 100 ms and never below the step's own; and
// the same script sent again becomes a new revision once a pace is waiting.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../../../nodes/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../../../executor/index.ts";
import { AutomationStudioLearnedPaces } from "../../../../learned-paces.ts";
import { AutomationStudioFlowCandidateSubmissionController } from "../../../index.ts";

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.press", version: "1.0.0", label: "Press", description: "Press one control", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "press" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "target", label: "Target", valueType: "object", required: true }]
};
const registry = new AutomationStudioNodeRegistry([definition]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };
const SELECTORS: Record<string, string> = { t1: "#renew", t2: "#hold", t3: "#renew" };
const binding = {
  resolvePlanNodeParameters: async ({ parameters }: { parameters: JsonObject }) => ({
    status: "resolved" as const,
    parameters: { target: { selector: SELECTORS[String((parameters.target as JsonObject).handle)]! } },
    handleViews: [{ handle: String((parameters.target as JsonObject).handle), view: 1, location: "https://library.test/" }]
  })
};

function candidate(steps: Array<{ key: string; handle: string; paceMs?: number }>): JsonObject {
  const nodes = steps.map((step) => ({ key: step.key, definitionId: definition.id, definitionVersion: definition.version, ...(step.paceMs ? { paceMs: step.paceMs } : {}), parameters: { target: { handle: step.handle } } }));
  const edges = nodes.slice(1).map((node, index) => ({ key: `e${index}`, source: { nodeKey: nodes[index]!.key, portId: "success" }, target: { nodeKey: node.key, portId: "in" } }));
  return { summary: "Renew the loans", plan: { schemaVersion: "0.1", router: { name: "Renew", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges }] } };
}

/** A trial that raised the pace of the step it ran with `selector`, to `raisedToMs`. */
function trialOf(paces: AutomationStudioLearnedPaces, selector: string, raisedToMs: number): void {
  const attempt = { attemptId: "trial.a1", nodeId: "trial.primary.s9", definitionId: definition.id, startedAt: 1, status: "failed", inputs: {}, outputs: {}, effects: [], pace: { inForceMs: 0, waitedMs: 0, raisedToMs } } as AutomationStudioNodeAttemptTrace;
  paces.trial([attempt], { nodes: [{ id: "trial.primary.s9", parameterValues: { target: { selector } } }] });
}

const controller = (exploredPaces?: AutomationStudioLearnedPaces) => new AutomationStudioFlowCandidateSubmissionController({
  projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding, ...(exploredPaces ? { exploredPaces } : {})
});
const pacesOf = (submitted: Awaited<ReturnType<ReturnType<typeof controller>["submit"]>>) => submitted.ok ? submitted.candidate.buildPlan.plan.subflows[0]!.nodes.map((node) => node.paceMs) : submitted;

describe("a step a trial slowed down", () => {
  it("is given the learned pace rounded up to 100 ms, by its parameters and whatever its key", async () => {
    const paces = new AutomationStudioLearnedPaces();
    trialOf(paces, "#renew", 1_250);
    const submitted = await controller(paces).submit(candidate([{ key: "a", handle: "t1" }, { key: "b", handle: "t2" }, { key: "c", handle: "t3" }]));

    // `t1` and `t3` resolve to the trial node's parameters; `t2` is another control and gets none.
    expect(pacesOf(submitted)).toEqual([1_300, undefined, 1_300]);
  });

  it("is a new revision when the same script is sent again after a trial learned a pace, and unchanged after that", async () => {
    const paces = new AutomationStudioLearnedPaces();
    const submission = controller(paces);
    const first = await submission.submit(candidate([{ key: "a", handle: "t1" }]));
    expect(first.ok && first.candidate.revision).toBe(1);
    expect(pacesOf(first)).toEqual([undefined]);

    trialOf(paces, "#renew", 2_000);
    const again = await submission.submit(candidate([{ key: "a", handle: "t1" }]));
    expect(again.ok && again.candidate.revision).toBe(2);
    expect(pacesOf(again)).toEqual([2_000]);

    const third = await submission.submit(candidate([{ key: "a", handle: "t1" }]));
    expect(third.ok).toBe(false);
  });

  it("is left as it was when no trial learned a pace", async () => {
    const submitted = await controller(new AutomationStudioLearnedPaces()).submit(candidate([{ key: "a", handle: "t1" }]));

    expect(pacesOf(submitted)).toEqual([undefined]);
  });
});
