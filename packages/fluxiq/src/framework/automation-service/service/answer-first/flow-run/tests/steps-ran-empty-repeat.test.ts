// A repeat over a list with nothing left has run, and is told apart from a repeat that was never
// reached (an earlier step failed) and from one whose list step failed to read (t945).
import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioFlowBuildPlan, AutomationStudioFlowBootstrapIssueLocator } from "../../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../../../executor/index.ts";
import { automationStudioAnswerFirstFlowRunStepsRan } from "../steps-ran.ts";

const keys = ["list", "press"];
const buildPlan = { plan: { subflows: [{ key: "primary", nodes: keys.map((key) => ({ key, definitionId: "library.step" })) }] } } as unknown as AutomationStudioFlowBuildPlan;
const locator: AutomationStudioFlowBootstrapIssueLocator = { paths: {}, nodes: Object.fromEntries(keys.map((_, index) => [`0.${index}`, { step: "library.step", draftStep: index + 1, draftStepId: `d${index + 1}` }])), edges: {}, subflows: {}, rules: {}, lines: [] };
const saved = [
  { id: "d1", position: 1 },
  { id: "d2", position: 2, routing: { kind: "repeat", through: "d2", over: "d1" } }
] as unknown as AutomationStudioFlowDraftStep[];
const graph = {
  ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.empty", projectId: "project", name: "Empty", now: 1 }),
  nodes: [
    { id: "start", definitionId: "builtin.control.start", parameterValues: { emitTimestamp: false } },
    { id: "n1", definitionId: "library.step", metadata: { bootstrapSymbolicKey: "list" } },
    { id: "fe", definitionId: "builtin.control.for-each" },
    { id: "n2", definitionId: "library.step", metadata: { bootstrapSymbolicKey: "press" } }
  ],
  edges: [
    { id: "e0", sourceNodeId: "start", targetNodeId: "n1", sourcePortId: "success", targetPortId: "in" },
    { id: "e1", sourceNodeId: "n1", targetNodeId: "fe", sourcePortId: "success", targetPortId: "in" },
    { id: "e2", sourceNodeId: "fe", targetNodeId: "n2", sourcePortId: "body", targetPortId: "in" }
  ]
};

const attemptOf = (nodeId: string, definitionId: string, status: "succeeded" | "failed", route: string, outputs: Record<string, unknown> = {}) => ({ attemptId: `${nodeId}.attempt.1`, nodeId, definitionId, startedAt: 1, finishedAt: 2, status, route, inputs: {}, outputs, effects: [], ...(status === "failed" ? { failure: { category: "action_failed", code: "web.read.failed", retryable: false, stage: "execution", effect: "unacted" } } : {}) }) as unknown as AutomationStudioNodeAttemptTrace;
const traceOf = (...attempts: AutomationStudioNodeAttemptTrace[]) => ({ status: "succeeded", startedAt: 1, finishedAt: 2, attempts, values: {}, effects: [] }) as unknown as AutomationStudioGraphExecutionTrace;
const list = attemptOf("n1", "library.step", "succeeded", "success");
const emptyLoop = attemptOf("fe", "builtin.control.for-each", "succeeded", "done", { count: 0 });

describe("a repeat that found nothing left to do", () => {
  const ran = (reachedEnd: boolean, trace: AutomationStudioGraphExecutionTrace) => automationStudioAnswerFirstFlowRunStepsRan({ buildPlan, locator, saved, ended: { reachedEnd, trace, graph } }).steps;

  it("has run: its list passed, its For Each said done on a count of 0, and the run reached the end", () => {
    expect(ran(true, traceOf(list, emptyLoop))).toMatchObject([{ position: 1, ran: "passed" }, { position: 2, ran: "passed" }]);
  });

  it("was not reached when an earlier step failed and the run stopped short", () => {
    expect(ran(false, traceOf(attemptOf("n1", "library.step", "failed", "failed")))[1]).toMatchObject({ position: 2, ran: "not_reached" });
  });

  it("is not reached when the list it repeats over failed to read", () => {
    expect(ran(true, traceOf(attemptOf("n1", "library.step", "failed", "failed")))).toMatchObject([{ position: 1, ran: "failed" }, { position: 2, ran: "not_reached" }]);
  });

  it("is not reached when the list passed but the loop was never reached, as a Flow that skipped its loop over rows left", () => {
    expect(ran(true, traceOf(list))[1]).toMatchObject({ position: 2, ran: "not_reached" });
  });

  it("is not reached when the loop took rows (count above 0) and its body has no attempt", () => {
    expect(ran(true, traceOf(list, attemptOf("fe", "builtin.control.for-each", "succeeded", "body", { count: 3, index: 0 })))[1]).toMatchObject({ position: 2, ran: "not_reached" });
  });

  it("is not reached when the loop said done without counting zero rows", () => {
    expect(ran(true, traceOf(list, attemptOf("fe", "builtin.control.for-each", "succeeded", "done", { count: 2 })))[1]).toMatchObject({ position: 2, ran: "not_reached" });
  });
});
