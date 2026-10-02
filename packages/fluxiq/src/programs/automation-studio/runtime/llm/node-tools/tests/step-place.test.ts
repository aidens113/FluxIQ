// Where a rerun runs, and what its result says about it (`../step-place.ts`).
//
// Live run `run-muqk713g-d08ad3dc` (C6, steps 0042-0060): after the saved Flow's
// answer was refuted, the re-author seeded its draft from the Flow. A seeded
// step records no `replay.from`, so every rerun of the Flow's list read ran on
// results page 5, where the refuted run had left the page: 1 page, 11 items,
// kept 0, unfiltered. Nothing in the rerun's result said it had run there, so
// the model chased a dedupe and dropped a correct condition.
//
// The fake site is that shape: five results pages, 13 rows the filter keeps on
// pages 1-4 and none on page 5, and a read that pages to the end.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioFlowDraftSeedFromFlow } from "../draft-from-flow.ts";
import { automationStudioRunNodeStartPages } from "../run-start-pages.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID } from "../run-node.ts";
import { automationStudioNodeRerunFromItsPlace, automationStudioNodeRerunPlaceNoted, type AutomationStudioNodeRerunPlace } from "../step-place.ts";

const CHEAP_PER_PAGE = [4, 3, 3, 3, 0];

/** The results site; `reset` is a replay's `{ replay: "reset", from }`. */
function site(start = 1) {
  let page = start;
  return vi.fn(async ({ value }: { callId: string; toolId: string; value: JsonObject }) => {
    if (value.replay === "reset") {
      const location = (value.from as JsonObject | undefined)?.location;
      if (typeof location !== "string") return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: false }, effectApplied: false, resultCode: "core.replay.reset_failed" };
      page = Number(location.slice("page=".length));
      return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
    }
    const pages = CHEAP_PER_PAGE.slice(page - 1);
    const kept = pages.reduce((sum, cheap) => sum + cheap, 0);
    page = 5;
    return { kind: "llm_evidence_tool_execution" as const, evidence: { rows: kept || 11, unfiltered: kept === 0, pagesRead: pages.length }, effectApplied: true, resultCode: "web.inspect.succeeded" };
  });
}

const node = (id: string, definitionId: string): AutomationStudioFlowNode => ({ id, definitionId, parameterValues: {} });
const edge = (id: string, sourceNodeId: string, targetNodeId: string): AutomationStudioFlowEdge => ({ id, sourceNodeId, targetNodeId });
const FLOW = {
  nodes: [node("main.s1", "web.output.browser-navigate"), node("main.s4", "web.output.dom-type"), node("main.s5", "web.output.dom-extract_list")],
  edges: [edge("e1", "main.s1", "main.s4"), edge("e2", "main.s4", "main.s5")]
};

/** The refuted run's attempts, with the page the host captured before each node. */
function refutedRun(): { actionAttempts: AutomationStudioFlowRunActionAttemptRecord[] } {
  const ran = (order: number, nodeId: string, location: string): AutomationStudioFlowRunActionAttemptRecord => ({
    attemptId: `a${order}`, nodeId, definitionId: "web", order, status: "succeeded", startedAt: order,
    metadata: { stateRefs: { beforeAction: { stateSnapshotId: `s${order}`, stateRef: `s${order}`, capturedAt: order, from: { location } } } }
  });
  return { actionAttempts: [ran(1, "main.s1", "page=0"), ran(2, "main.s4", "page=0"), ran(3, "main.s5", "page=1")] };
}

/** The rerun the evidence loop makes: put the page back, then run the step's own call. */
async function rerun(step: AutomationStudioFlowDraftStep, startedOn: JsonObject | undefined, executeTool: ReturnType<typeof site>) {
  const place = await automationStudioNodeRerunFromItsPlace({ step, startedOn, now: "page=5", callId: "rerun.5", executeTool });
  const ran = place.kind === "unreachable" ? place.result : await executeTool({ callId: "rerun.5", toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, value: { node: "web.output.dom-extract_list" } });
  return { place, ran: automationStudioNodeRerunPlaceNoted(place, ran) as { evidence: JsonObject } };
}

describe("a rerun of a step seeded from the Flow, after the refuted run left the page on 5", () => {
  it("puts the page back where the node started in that run, and reads the 13 rows rather than page 5's 11 unfiltered", async () => {
    const seed = automationStudioFlowDraftSeedFromFlow({ ...FLOW, startPages: automationStudioRunNodeStartPages(refutedRun()) });
    const read = seed.steps[2]!;
    const executeTool = site(5);

    const { place, ran } = await rerun(read, seed.startedOnByStepId[read.id!], executeTool);

    expect(executeTool.mock.calls.map(([call]) => [call.callId, call.value])).toEqual([
      ["rerun.5.place", { replay: "reset", from: { location: "page=1" } }],
      ["rerun.5", { node: "web.output.dom-extract_list" }]
    ]);
    expect(place).toEqual({ kind: "put_back", callId: "rerun.5.place", startPage: "seeded_run" });
    expect(ran.evidence).toMatchObject({ rows: 13, unfiltered: false, pagesRead: 5, rerunPlace: { place: "put_back", startPage: "seeded_run" } });
  });

  it("before the fix the same rerun read page 5 alone, and now its result says it ran where the page was", async () => {
    const [, , read] = automationStudioFlowDraftSeedFromFlow(FLOW).steps;
    const executeTool = site(5);

    const { place, ran } = await rerun(read!, undefined, executeTool);

    expect(executeTool.mock.calls.map(([call]) => call.callId)).toEqual(["rerun.5"]);
    expect(place).toEqual({ kind: "in_place", why: "start_page_unknown" });
    expect(ran.evidence).toMatchObject({ rows: 11, unfiltered: true, pagesRead: 1 });
    expect(ran.evidence.rerunPlace).toMatchObject({ place: "in_place", reason: "start_page_unknown" });
    expect(String((ran.evidence.rerunPlace as JsonObject).detail)).toMatch(/where the page is now/u);
  });
});

describe("where a rerun runs", () => {
  const step = (fields: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
    position: 1, id: "d1", iteration: 1, actionId: "read", toolId: "read", input: {}, effect: "observe", disposition: "kept", ...fields
  });

  it("puts back the step's own recorded page before the seeded one", async () => {
    const executeTool = site(5);
    const place = await automationStudioNodeRerunFromItsPlace({ step: step({ replay: { from: { location: "page=2" } } }), startedOn: { location: "page=1" }, now: "page=5", callId: "r", executeTool });
    expect(place).toEqual({ kind: "put_back", callId: "r.place", startPage: "step" });
    expect(executeTool.mock.calls[0]![0].value).toEqual({ replay: "reset", from: { location: "page=2" } });
  });

  it("runs where it is, and says so, when the page is still the one its step started on", async () => {
    const executeTool = site(1);
    const place = await automationStudioNodeRerunFromItsPlace({ step: step({ replay: { from: { location: "page=1" } }, stateBefore: "page=1" }), now: "page=1", callId: "r", executeTool });
    expect(place).toEqual({ kind: "in_place", why: "already_there" });
    expect(executeTool).not.toHaveBeenCalled();
    expect(automationStudioNodeRerunPlaceNoted(place, { rows: 13 })).toEqual({ rows: 13, rerunPlace: { place: "in_place", reason: "already_on_start_page" } });
  });

  it("does not put a seeded step back when nothing recorded where its node started", async () => {
    const executeTool = site(5);
    expect(await automationStudioNodeRerunFromItsPlace({ step: step(), now: "page=5", callId: "r", executeTool })).toEqual({ kind: "in_place", why: "start_page_unknown" });
    expect(executeTool).not.toHaveBeenCalled();
  });
});

describe("what a rerun's result says about where it ran", () => {
  const inPlace: AutomationStudioNodeRerunPlace = { kind: "in_place", why: "start_page_unknown" };

  it("notes a plain answer as well as an execution result", () => {
    expect(automationStudioNodeRerunPlaceNoted(inPlace, { rows: 11 })).toMatchObject({ rows: 11, rerunPlace: { place: "in_place", reason: "start_page_unknown" } });
  });

  it("leaves an answer it cannot note, and a call that was not a rerun, as they are", () => {
    const listed = { kind: "llm_evidence_tool_execution" as const, evidence: [1, 2] as JsonValue, effectApplied: false };
    expect(automationStudioNodeRerunPlaceNoted(inPlace, listed)).toBe(listed);
    expect(automationStudioNodeRerunPlaceNoted(inPlace, "text")).toBe("text");
    expect(automationStudioNodeRerunPlaceNoted(undefined, { rows: 11 })).toEqual({ rows: 11 });
  });

  it("leaves an unreachable place's own answer as it is: it already says nothing ran", () => {
    const unreachable = { kind: "llm_evidence_tool_execution" as const, evidence: { ok: false, code: "rerun_place_unreachable" }, effectApplied: false };
    expect(automationStudioNodeRerunPlaceNoted({ kind: "unreachable", callId: "r.place", result: unreachable }, unreachable)).toBe(unreachable);
  });
});
