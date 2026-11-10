// A child Flow's deadline, read from the trace the engine really leaves. No draft step can make
// a Call Flow node: its target rides on node metadata (`flows/executable/composite/configuration.ts`),
// which a step's parameters never become, so the whole path cannot reach one today. The reading is
// proved here, so a Flow that gains one reads as any other failing step.
import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, createCallFlowNode, createPublishedFlowSnapshot } from "../../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioFlowBuildPlan, AutomationStudioFlowBootstrapIssueLocator } from "../../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { runCanonicalAutomationStudioFlow } from "../../../../composite-executor.ts";
import { runAutomationStudioGraph } from "../../../../../../engine/automation/index.ts";
import { AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION } from "../../../../../../runtime/automation-parking/index.ts";
import { automationStudioAnswerFirstFlowRunStepsRan } from "../steps-ran.ts";

const plan = (keys: readonly string[]): AutomationStudioFlowBuildPlan => ({ plan: { subflows: [{ key: "primary", nodes: keys.map((key) => ({ key, definitionId: "library.step" })) }] } }) as unknown as AutomationStudioFlowBuildPlan;
const locator = (keys: readonly string[]): AutomationStudioFlowBootstrapIssueLocator => ({ paths: {}, nodes: Object.fromEntries(keys.map((_, index) => [`0.${index}`, { step: "library.step", draftStep: index + 1, draftStepId: `d${index + 1}` }])), edges: {}, subflows: {}, rules: {}, lines: [] });

describe("what a run left", () => {
  it("a child Flow's deadline the engine really reaches is a failing step at the step that called it", async () => {
    const child = { ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.slow", projectId: "project", name: "Slow", now: 1 }), executionDefaults: { timeoutMs: 15 }, nodes: [{ id: "action", definitionId: "builtin.policy.action", parameterValues: { outputId: "library.slow", parameters: {} } }], edges: [] };
    const snapshot = createPublishedFlowSnapshot(child, "1.0.0", 2);
    const call = createCallFlowNode({ id: "call", target: { flowId: child.flowId, version: "1.0.0", scope: { kind: "global" } } });
    const parent = { ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.parent", projectId: "project", name: "Parent", now: 1 }), nodes: [{ ...call, metadata: { ...call.metadata, bootstrapSymbolicKey: "s1" } }], edges: [] };
    const trace = await runCanonicalAutomationStudioFlow(parent, [snapshot], { effectDispatcher: () => new Promise(() => undefined) });
    expect(trace.status).toBe("failed");
    expect(trace.attempts.find((attempt) => attempt.nodeId === "call")?.childTrace?.message).toBe("Flow execution deadline exceeded.");
    const outcome = automationStudioAnswerFirstFlowRunStepsRan({ buildPlan: plan(["s1"]), locator: locator(["s1"]), saved: [], ended: { reachedEnd: false, code: "candidate.execution_incomplete", trace, graph: parent } });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: false, failing: { position: 1, happened: "A Flow this step calls reached the time it is allowed, so the step did not finish." } });
  });

  it("a run that reached no step of the plan still names one: the first it did not reach", () => {
    const trace = { status: "failed" as const, startedAt: 1, finishedAt: 2, attempts: [], values: {}, effects: [], message: "Page said: Elm Street 4" };
    const outcome = automationStudioAnswerFirstFlowRunStepsRan({ buildPlan: plan(["s1", "s2"]), locator: locator(["s1", "s2"]), saved: [], ended: { reachedEnd: false, code: "candidate.execution_incomplete", trace } });
    expect(outcome).toEqual({
      kind: "ran", reachedEnd: false,
      steps: [{ position: 1, ran: "failed", happened: "The saved Flow could not be started, so nothing was done." }, { position: 2, ran: "not_reached" }],
      failing: { position: 1, happened: "The saved Flow could not be started, so nothing was done.", code: "candidate.execution_incomplete" }
    });
  });

  it("a step whose check the person cleared passed, and the run went on from it (scripted pair run-mwa86qgu-9ded690b)", async () => {
    const keys = ["s1", "s2", "s3"];
    const chain = ["start", "n1", "n2", "n3"];
    const graph = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.checked", projectId: "project", name: "Checked", now: 1 }),
      nodes: [{ id: "start", definitionId: "builtin.control.start", parameterValues: { emitTimestamp: false } }, ...keys.map((key, index) => ({ id: `n${index + 1}`, definitionId: "library.step", metadata: { bootstrapSymbolicKey: key } }))],
      edges: chain.slice(1).map((target, index) => ({ id: `e${index}`, sourceNodeId: chain[index]!, targetNodeId: target, sourcePortId: "success", targetPortId: "in" }))
    };
    const trace = await runAutomationStudioGraph(graph, {
      now: () => 1_000,
      delay: () => Promise.resolve(),
      // The first step meets a check; the third fails on its own, so the run stops there.
      // The first is a press the check answered: it was made, so once the check is cleared the run goes on from it (`engine/automation/person-cleared.ts`).
      resolveActionEffect: (node) => node.id === "n1" ? { effectClass: "commit", permissionConsequences: [] } : undefined,
      nativeNodeExecutor: (request) => Promise.resolve({ result: request.node.id === "n2" ? { status: "success", route: "success", outputs: {} } : { status: "failed", route: "failed", outputs: {}, failure: request.node.id === "n1" ? { category: "user_intervention_required", code: "web.intervention.required", retryable: false, stage: "execution" } : { category: "target_not_found", code: "executor.target.gone", retryable: false, stage: "execution" } } }),
      parking: { open: () => undefined, awaitAnswer: (ask) => Promise.resolve({ askId: ask.askId, answeredAt: 1_005, kind: "choice", value: AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION, actorId: null }) }
    });
    const outcome = automationStudioAnswerFirstFlowRunStepsRan({ buildPlan: plan(keys), locator: locator(keys), saved: [], ended: { reachedEnd: false, code: "candidate.execution_incomplete", trace, graph } });
    expect(outcome.steps[0]).toEqual({ position: 1, ran: "passed", happened: "It met a check only a person can complete; the person completed it, and the run went on from this step.", personCleared: true });
    expect(outcome.steps[1]).toEqual({ position: 2, ran: "passed" });
    expect(outcome.failing?.position).toBe(3);
  });

  it("a whole run has no failing step", () => {
    const outcome = automationStudioAnswerFirstFlowRunStepsRan({ buildPlan: plan(["s1"]), locator: locator(["s1"]), saved: [], ended: { reachedEnd: true } });
    expect(outcome).toEqual({ kind: "ran", reachedEnd: true, steps: [{ position: 1, ran: "not_reached" }] });
  });
});
