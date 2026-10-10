// A route back never repeats a completed act (t411; recovery matrix row 10,
// t404): the run's completed-act ledger skips a lasting act it already did as
// already done, so a handler's route back to the list's checkpoint is taken,
// and only the act still owed is done. An uncertain act still refuses the route.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { automationStudioRootInvocation } from "../../frames/index.ts";
import { edge, graph } from "../../lifecycle-run/tests/lifecycle-fixtures.ts";
import { checkpoint, failingFirst, framedRun, withRows } from "../../lifecycle-run/tests/recovery-paths-fixtures.ts";
import { closer, fact, landedCounts, line, page, pageOptions, press, type Page } from "../../lifecycle-run/tests/wiring-fixtures.ts";
import { automationStudioStepLifecycleRouteGuard } from "../lifecycle-route-guard.ts";
import type { AutomationStudioStepLoopContext } from "../loop-context.ts";

/** The requests, each row's first column its name, as a read list keeps it. */
const PEOPLE = [{ name: "Amara Osei", id: "amara" }, { name: "Jonas Weber", id: "jonas" }, { name: "Lin Zhao", id: "lin" }, { name: "Freya Holm", id: "freya" }];

/** A confirm whose act lasts, labelled as a person reads it. */
function confirm(id: string, elementId: JsonObject | string = id, label = `Confirm ${id}`): AutomationStudioFlowNode {
  return { id, label, definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId } }, metadata: { declaredConsequences: ["accepts a friend request"] } };
}

/** A retry handler on `nodeIds` that closes the notice and goes back to the requests checkpoint. */
function backToRequests(nodeIds: string[]) {
  return closer("h.slow", { event: "retry", scope: { kind: "nodes", nodeIds }, when: [fact("cleared")] }, { disposition: "route", checkpointId: "cp.requests" }, "The site says the run is going too fast");
}

/** The ids each attempt of `nodeId` came to: its skip reason, else its status. */
function cameTo(attempts: readonly AutomationStudioNodeAttemptTrace[], nodeId: string): string[] {
  return attempts.filter((attempt) => attempt.nodeId === nodeId).map((attempt) => attempt.skipped?.reason ?? attempt.status);
}

function said(rows: readonly ClientGatewayActivity[]): string[] {
  return rows.map((row) => row.label).filter((label) => label.startsWith("Already done"));
}

describe("the completed-act ledger", () => {
  it("row 10's shape: four confirms, the fourth refused, a route back to the requests checkpoint, and only the fourth is confirmed after it", async () => {
    const current = page();
    const flow = line("graph.main", [checkpoint("requests", "cp.requests"), ...PEOPLE.map((person) => confirm(person.id, person.id, `Confirm ${person.name}`))], [backToRequests(PEOPLE.map((person) => person.id))]);
    const options = pageOptions(current);
    failingFirst(options, "freya", 1, true);
    const { result, rows } = await withRows(() => framedRun(flow, options));
    const { trace, invocation } = result;

    expect(trace.status).toBe("succeeded");
    expect(current.landed).toEqual(["requests", "amara", "jonas", "lin", "dismiss", "requests", "freya"]);
    expect(landedCounts(current)).toMatchObject({ amara: 1, jonas: 1, lin: 1, freya: 1 });
    for (const id of ["amara", "jonas", "lin"]) expect(cameTo(trace.attempts, id)).toEqual(["succeeded", "already_done"]);
    expect(cameTo(trace.attempts, "freya")).toEqual(["failed", "succeeded"]);
    expect(invocation.run.lifecycle.ledger.routesForRun).toBe(1);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "amara" && attempt.skipped)).toMatchObject({
      route: "success",
      skipped: { reason: "already_done", code: "executor.act.already_done", attemptId: trace.attempts.find((attempt) => attempt.nodeId === "amara")!.attemptId }
    });
    expect(said(rows)).toEqual(["Already done: Confirm Amara Osei", "Already done: Confirm Jonas Weber", "Already done: Confirm Lin Zhao"]);
  });

  it("a loop of four confirms: a route back to the list checkpoint after the third, and only the fourth is confirmed afterwards, the first three skipped as already done", async () => {
    const current = page();
    let reads = 0;
    // The list is read afresh at each visit, with handles minted per read, as a read list's rows carry them.
    const options = listOptions(current, () => PEOPLE.map((person, index) => ({ ...person, $handle: `read-${reads}-row-${index}` })), () => { reads += 1; });
    failingFirst(options, "freya", 1, true);
    const { result, rows } = await withRows(() => framedRun(listFlow(), options));
    const { trace } = result;

    expect(trace.status).toBe("succeeded");
    expect(current.landed).toEqual(["requests", "amara", "jonas", "lin", "dismiss", "requests", "freya"]);
    expect(cameTo(trace.attempts, "confirm")).toEqual(["succeeded", "succeeded", "succeeded", "failed", "already_done", "already_done", "already_done", "succeeded"]);
    expect(trace.attempts.filter((attempt) => attempt.skipped?.reason === "already_done").map((attempt) => attempt.skipped)).toEqual(
      ["Amara Osei", "Jonas Weber", "Lin Zhao"].map((row) => expect.objectContaining({ row }))
    );
    expect(said(rows)).toEqual(["Already done for Amara Osei", "Already done for Jonas Weber", "Already done for Lin Zhao"]);
    expect(reads).toBe(2);
  });

  it("does the same act again for another row, and for the same node with another target", async () => {
    const current = page();
    const options = listOptions(current, () => [...PEOPLE, PEOPLE[0]!].map((person) => ({ ...person })), () => undefined);
    const { result } = await withRows(() => framedRun(listFlow(), options));
    expect(result.trace.status).toBe("succeeded");
    // The fifth row is Amara again: the same row, so the same act, done once.
    expect(current.landed).toEqual(["requests", "amara", "jonas", "lin", "freya"]);
    expect(cameTo(result.trace.attempts, "confirm").at(-1)).toBe("already_done");
  });

  it("still refuses a route back past an act whose outcome is uncertain, at the failing step or on the way back, and past a completed act the ledger does not hold", () => {
    const flow = line("graph.main", [checkpoint("requests", "cp.requests"), confirm("pay"), press("s3")]);
    const uncertain: AutomationStudioNodeAttemptTrace = { attemptId: "pay.attempt.2", nodeId: "pay", definitionId: "builtin.policy.action", startedAt: 1, finishedAt: 1, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [], fault: { actUncertain: true } as NonNullable<AutomationStudioNodeAttemptTrace["fault"]> };
    const done: AutomationStudioNodeAttemptTrace = { ...uncertain, attemptId: "pay.attempt.1", status: "succeeded", route: "success" };
    delete done.fault;
    const invocation = automationStudioRootInvocation(flow, { currentSubflowId: "main" });
    const guardFrom = (fromNodeId: string, attempts: AutomationStudioNodeAttemptTrace[]) => automationStudioStepLifecycleRouteGuard({ flow, attempts, options: { invocation } } as unknown as AutomationStudioStepLoopContext, fromNodeId)({ checkpointId: "cp.requests", invocationId: invocation.frame.invocationId, graphFlowId: "graph.main", nodeId: "requests" });

    expect(guardFrom("pay", [uncertain])).toEqual({ passesUncertainAct: true });
    expect(guardFrom("s3", [uncertain])).toEqual({ passesUncertainAct: true });
    // A completed act the ledger does not hold (a resumed run begins with an empty ledger) would not be skipped.
    expect(guardFrom("s3", [done])).toEqual({ passesUncertainAct: false, repeatsUnrecordedAct: true });
    // One the ledger holds no longer refuses the route: it is skipped as already done.
    invocation.run.lifecycle.completedActs.set("graph.main/pay/digest", { key: "graph.main/pay/digest", nodeId: "pay", attemptId: "pay.attempt.1", outputs: {} });
    expect(guardFrom("s3", [done])).toEqual({ passesUncertainAct: false });
  });
});

/**
 * start -> requests (checkpoint, reads the list) -> each (For Each over its
 * rows) -> confirm (presses the row's id; its act lasts) -> each; done -> end.
 * A retry handler on confirm goes back to the requests checkpoint.
 */
function listFlow() {
  const nodes: AutomationStudioFlowNode[] = [
    { id: "start", definitionId: "builtin.control.start" },
    checkpoint("requests", "cp.requests"),
    { id: "each", definitionId: "builtin.control.for-each" },
    confirm("confirm", { $state: { path: "item.id" } } as unknown as JsonObject, "Confirm"),
    { id: "done", definitionId: "builtin.control.end" }
  ];
  const edges: AutomationStudioFlowEdge[] = [
    edge("start", "requests"),
    edge("requests", "each"),
    { ...edge("requests", "each", "rows"), targetPortId: "items" },
    edge("each", "confirm", "body"),
    { ...edge("each", "confirm", "item"), targetPortId: "item" },
    edge("confirm", "each"),
    edge("each", "done", "done")
  ];
  const handler = backToRequests(["confirm"]);
  return graph("graph.main", [...nodes, ...handler.nodes], [...edges, ...handler.edges]);
}

/** The page's options, with the requests press answering `rows()` as its `rows` output and calling `onRead` each time. */
function listOptions(current: Page, rows: () => JsonObject[], onRead: () => void): AutomationStudioGraphExecutionOptions {
  const options = pageOptions(current);
  const dispatch = options.effectDispatcher!;
  options.effectDispatcher = async (effect, context) => {
    const result = await dispatch(effect, context);
    const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1];
    if (id !== "requests" || result?.status !== "success") return result;
    onRead();
    return { ...result, outputs: { ...(result.outputs ?? {}), rows: rows() } };
  };
  return options;
}
