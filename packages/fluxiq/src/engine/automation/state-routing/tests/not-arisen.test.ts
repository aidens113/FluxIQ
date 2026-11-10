// A step whose state never arose because its way in, a lasting act, did not act this run
// (`../not-arisen.ts`): which ways in prove it, and which do not.

import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../flows/executable/graph/index.ts";
import type { AutomationStudioFlowDocument } from "../../tests/fixture-contracts.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../index.ts";
import { AUTOMATION_STUDIO_ALREADY_DONE_OUTPUT, AUTOMATION_STUDIO_STATE_NOT_ARISEN_CODE, automationStudioStateNotArisenWayOn, automationStudioStateRouteGuard, decideAutomationStudioStateRoute } from "../index.ts";

const view: AutomationStudioFlowNode = { id: "view", definitionId: "domain.press", label: "View cart", parameterValues: { selector: ".drawer a" } };

function flowOf(follow: AutomationStudioFlowNode = view): AutomationStudioFlowDocument {
  const nodes: AutomationStudioFlowNode[] = [{ id: "add", definitionId: "domain.press", metadata: { declaredConsequences: ["create_new"] } }, { id: "join", definitionId: "builtin.control.merge" }, follow, { id: "done", definitionId: "builtin.control.end" }];
  const link = (from: string, to: string): AutomationStudioFlowEdge => ({ id: `${from}-${to}`, sourceNodeId: from, sourcePortId: "success", targetNodeId: to, targetPortId: "in" });
  return { schemaVersion: "0.1", flowId: "not.arisen", ownerKind: "routine", ownerId: "not.arisen", name: "Not arisen", createdAt: 1, updatedAt: 1, nodes, edges: [link("add", "join"), link("join", follow.id), link(follow.id, "done")] };
}

function attempt(nodeId: string, definitionId: string, extra: Partial<AutomationStudioNodeAttemptTrace> & { outputs?: Record<string, JsonValue> } = {}): AutomationStudioNodeAttemptTrace {
  return { attemptId: `${nodeId}.attempt.1`, nodeId, definitionId, startedAt: 1, finishedAt: 1, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [], ...extra };
}

const notFound = (): AutomationStudioNodeAttemptTrace => attempt("view", "domain.press", { status: "failed", route: "failed", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution", effect: "unacted" } });
const carried = () => attempt("add", "domain.press", { outputs: { skipped: AUTOMATION_STUDIO_ALREADY_DONE_OUTPUT } });
const joined = () => attempt("join", "builtin.control.merge");

describe("the way on past a step whose state never arose", () => {
  it("is its success way when its way in, through a join, was a lasting act not done again", () => {
    const edge = automationStudioStateNotArisenWayOn({ flow: flowOf(), node: view, attempts: [carried(), joined(), notFound()] });
    expect(edge?.targetNodeId).toBe("done");
  });

  it("is its success way when its way in was the run's own completed-act skip, or a step this rule passed over", () => {
    const ledger = attempt("add", "domain.press", { skipped: { reason: "already_done", code: "executor.act.already_done", attemptId: "add.attempt.0" } });
    const passed = attempt("add", "domain.press", { route: "skipped", skipped: { reason: "target_absent", code: AUTOMATION_STUDIO_STATE_NOT_ARISEN_CODE } });
    for (const wayIn of [ledger, passed]) expect(automationStudioStateNotArisenWayOn({ flow: flowOf(), node: view, attempts: [wayIn, notFound()] })?.targetNodeId).toBe("done");
  });

  it("is nothing when the way in acted, was a sometimes-present step not shown, or a plain press said nothing", () => {
    const acted = attempt("add", "domain.press", { effects: [{ type: "policy.output.dispatch" }] });
    const plain = attempt("add", "domain.press");
    const optionalAbsent = attempt("add", "domain.press", { route: "skipped", skipped: { reason: "target_absent", code: "web.target.not_found" } });
    const failed = attempt("add", "domain.press", { status: "failed", route: "failed", outputs: { skipped: AUTOMATION_STUDIO_ALREADY_DONE_OUTPUT } });
    for (const wayIn of [acted, plain, optionalAbsent, failed]) expect(automationStudioStateNotArisenWayOn({ flow: flowOf(), node: view, attempts: [wayIn, notFound()] })).toBeUndefined();
    expect(automationStudioStateNotArisenWayOn({ flow: flowOf(), node: view, attempts: [notFound()] })).toBeUndefined();
  });

  it("is nothing for a read: its rows are the result", () => {
    const read: AutomationStudioFlowNode = { ...view, parameterValues: { recordOutput: { datasetId: "cart" } } };
    expect(automationStudioStateNotArisenWayOn({ flow: flowOf(read), node: read, attempts: [carried(), notFound()] })).toBeUndefined();
  });
});

describe("state routing a follow-on of a lasting act not done again", () => {
  const options = { resolveActionEffect: (node: AutomationStudioFlowNode) => ({ effectClass: node.metadata?.declaredConsequences ? "commit" as const : "state" as const, permissionConsequences: [] }) };

  it("goes on past it, unobserved, under its own code", async () => {
    const decision = await decideAutomationStudioStateRoute({ flow: flowOf(), node: view, attempt: notFound(), attempts: [carried(), joined(), notFound()], options, guard: automationStudioStateRouteGuard() });
    expect(decision).toMatchObject({ kind: "declared", code: AUTOMATION_STUDIO_STATE_NOT_ARISEN_CODE, edge: { targetNodeId: "done" } });
  });

  it("keeps a follow-on that does a lasting act on its recovery", async () => {
    const send: AutomationStudioFlowNode = { ...view, metadata: { declaredConsequences: ["send"] } };
    const decision = await decideAutomationStudioStateRoute({ flow: flowOf(send), node: send, attempt: notFound(), attempts: [carried(), notFound()], options, guard: automationStudioStateRouteGuard() });
    expect(decision.kind).toBe("none");
  });
});
