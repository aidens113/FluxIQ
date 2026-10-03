// What "Step N of M" counts while a Flow runs (UI-3). A merge
// (`builtin.control.merge`) joins paths and does nothing a person sees, so a run
// says no step card for it and leaves it out of both N and M: five acts and two
// merges read "Step 5 of 5", never "Step 7 of 7" over five cards. A branch, a
// check or any other node stays counted.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationNodeExecutionResult } from "../../../nodes/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../activity/index.ts";
import { AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION } from "../../parking/index.ts";
import { resumeAutomationStudioGraph, runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../index.ts";

const NOW = 1_000;

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const page = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "domain.page.step", label: `Act ${id}` });
const merge = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } });

/** The nodes in order, each joined to the next on its success route. */
function line(nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument {
  const edges = nodes.slice(1).map((node, index) => {
    const source = nodes[index]!;

    return { id: `e.${source.id}`, sourceNodeId: source.id, sourcePortId: "success", targetNodeId: node.id, targetPortId: node.definitionId === "builtin.control.merge" ? "branches" : "in" };
  });
  return { schemaVersion: "0.1", flowId: "flow.step-count", ownerKind: "routine", ownerId: "routine.step-count", name: "Step count", createdAt: 1, updatedAt: 1, nodes, edges };
}

const CHECK_RESULT: AutomationNodeExecutionResult = {
  status: "failed",
  route: "failed",
  outputs: {},
  message: "A robot check is on the page.",
  failure: { category: "user_intervention_required", code: "web.intervention.required", retryable: false, stage: "execution" }
};

const options: AutomationStudioGraphExecutionOptions = {
  now: () => NOW,
  delay: () => Promise.resolve(),
  nativeNodeExecutor: (request) => Promise.resolve({ result: request.node.id === "check" ? CHECK_RESULT : { status: "success", route: "success", outputs: {} } })
};

async function inRun<T>(fn: () => Promise<T>): Promise<T> {
  return await runWithAutomationStudioActivity({ kind: "run", id: "r1", projectId: "p1" }, fn);
}

/** Each step card the run said, as [node, index, count, label]. */
function steps(): unknown[][] {
  return seen.filter((event) => event.detail?.kind === "step" && event.step).map((event) => [event.step!.nodeId, event.step!.index, event.step!.count, event.label]);
}

describe("the step count a run shows", () => {
  it("leaves merges out of the cards and out of N and M", async () => {
    const flow = line([page("a"), merge("m1"), page("b"), merge("m2"), page("c"), page("d"), page("e")]);
    const trace = await inRun(() => runAutomationStudioGraph(flow, options));
    expect([trace.status, trace.message]).toEqual(["succeeded", undefined]);
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["a", "m1", "b", "m2", "c", "d", "e"]);
    expect(steps()).toEqual([
      ["a", 1, 5, "Running step 1 of 5: Act a"],
      ["b", 2, 5, "Running step 2 of 5: Act b"],
      ["c", 3, 5, "Running step 3 of 5: Act c"],
      ["d", 4, 5, "Running step 4 of 5: Act d"],
      ["e", 5, 5, "Running step 5 of 5: Act e"]
    ]);
  });

  it("goes on counting from where a parked run stopped, without the merges it passed", async () => {
    const flow = line([page("a"), merge("m1"), page("check"), merge("m2"), page("read")]);
    const parked = await inRun(() => runAutomationStudioGraph(flow, { ...options, parking: { open: () => undefined } }));
    expect(parked.status).toBe("waiting");
    const askId = parked.parked!.ask.askId;
    const resumed = await inRun(() => resumeAutomationStudioGraph({ flow, trace: parked, resumption: { kind: "answer", answer: { askId, answeredAt: NOW + 5, kind: "choice", value: AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION, actorId: null } }, options }));
    expect((resumed as { trace: AutomationStudioGraphExecutionTrace }).trace.status).toBe("succeeded");
    expect(steps().map(([node, index, count]) => [node, index, count])).toEqual([
      ["a", 1, 3],
      ["check", 2, 3],
      ["read", 3, 3]
    ]);
  });
});
