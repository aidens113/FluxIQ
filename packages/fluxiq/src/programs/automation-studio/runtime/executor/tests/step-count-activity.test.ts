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

// read-list S3: a list read reads one page, and a Flow pages with a do-while
// loop -- Merge, Repeat, read, Next, and Next's `ended` leaves the loop. Each
// step of a pass says which page it is on, and the loop's end is said once.
describe("the words a paging loop says", () => {
  const PAGES = 5;
  /** type -> loop (Merge) -> Repeat.body -> read -> Next; Next.success -> loop; Next.ended and Repeat.done -> exit -> after. */
  function paging(most?: number): AutomationStudioFlowDocument {
    const nodes: AutomationStudioFlowNode[] = [
      { id: "search", definitionId: "web.output.dom-type", parameterValues: { element: { label: "Search" } } },
      { id: "loop", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } },
      { id: "repeat", definitionId: "builtin.control.repeat", ...(most === undefined ? {} : { parameterValues: { most } }) },
      { id: "read", definitionId: "web.output.dom-extract_list" },
      { id: "next", definitionId: "web.output.dom-click", parameterValues: { element: { accessibleName: "Next" } } },
      { id: "exit", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } },
      { id: "after", definitionId: "domain.page.step", label: "Save the rows" }
    ];
    const edge = (source: string, port: string, target: string, targetPort = "in") => ({ id: `e.${source}.${port}`, sourceNodeId: source, sourcePortId: port, targetNodeId: target, targetPortId: targetPort });
    const edges = [
      edge("search", "success", "loop", "branches"), edge("loop", "success", "repeat"), edge("repeat", "body", "read"),
      edge("read", "success", "next"), edge("next", "success", "loop", "branches"), edge("next", "ended", "exit", "branches"),
      edge("repeat", "done", "exit", "branches"), edge("exit", "success", "after")
    ];
    return { schemaVersion: "0.1", flowId: "flow.paging", ownerKind: "routine", ownerId: "routine.paging", name: "Paging", createdAt: 1, updatedAt: 1, nodes, edges };
  }
  /** Next answers `ended` on its `endsAt`-th press, and `success` before. */
  const pagingOptions = (endsAt: number): AutomationStudioGraphExecutionOptions => {
    let nexts = 0;
    return {
      ...options,
      nativeNodeExecutor: (request) => {
        if (request.node.id === "next") nexts += 1;
        return Promise.resolve({ result: { status: "success", route: request.node.id === "next" && nexts === endsAt ? "ended" : "success", outputs: {} } });
      }
    };
  };
  const said = () => seen.filter((event) => event.detail && event.detail.kind !== "thought").map((event) => event.label);

  it("names the page each step of a pass is on, and says once that the list ended", async () => {
    const trace = await inRun(() => runAutomationStudioGraph(paging(), pagingOptions(PAGES)));
    expect(trace.status).toBe("succeeded");
    const pass = (n: number) => [`Running step 3 of 5: Reading page ${n}`, `Running step 4 of 5: Clicking “Next” on page ${n}`];
    expect(said()).toEqual([
      "Running step 1 of 5: Typing into “Search”",
      ...[1, 2, 3, 4, 5].flatMap((n) => ["Running step 2 of 5", ...pass(n)]),
      "The list ended after 5 pages",
      "Running step 5 of 5: Save the rows"
    ]);
    expect(seen.filter((event) => event.label === "The list ended after 5 pages").map((event) => event.detail)).toEqual([
      { kind: "note", title: "The list ended after 5 pages", status: "succeeded", ref: "repeat", text: "Node: builtin.control.repeat" }
    ]);
    expect(JSON.stringify(said())).not.toMatch(/builtin|web\.output|paginate|repeat\b/u);
  });

  it("says the loop stopped at its most passes when the list never ends", async () => {
    const trace = await inRun(() => runAutomationStudioGraph(paging(2), pagingOptions(99)));
    expect(trace.status).toBe("succeeded");
    expect(said()).toEqual([
      "Running step 1 of 5: Typing into “Search”",
      "Running step 2 of 5", "Running step 3 of 5: Reading page 1", "Running step 4 of 5: Clicking “Next” on page 1",
      "Running step 2 of 5", "Running step 3 of 5: Reading page 2", "Running step 4 of 5: Clicking “Next” on page 2",
      "Running step 2 of 5",
      "The loop stopped at its most passes (2 pages)",
      "Running step 5 of 5: Save the rows"
    ]);
  });
});
