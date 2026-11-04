// A child Flow's deadline, read from the trace the engine really leaves. No draft step can make
// a Call Flow node: its target rides on node metadata (`flows/executable/composite/configuration.ts`),
// which a step's parameters never become, so the whole path cannot reach one today. The reading is
// proved here, so a Flow that gains one reads as any other failing step.
import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, createCallFlowNode, createPublishedFlowSnapshot } from "../../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioFlowBuildPlan, AutomationStudioFlowBootstrapIssueLocator } from "../../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { runCanonicalAutomationStudioFlow } from "../../../../composite-executor.ts";
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

  it("a whole run has no failing step", () => {
    const outcome = automationStudioAnswerFirstFlowRunStepsRan({ buildPlan: plan(["s1"]), locator: locator(["s1"]), saved: [], ended: { reachedEnd: true } });
    expect(outcome).toEqual({ kind: "ran", reachedEnd: true, steps: [{ position: 1, ran: "not_reached" }] });
  });
});
