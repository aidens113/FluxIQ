// A re-author's carried steps are run by the test as the Flow saved them, and
// nobody is told to rerun one it did not change (t274-c4).
//
// Live run `run-muw60j7c-bb7c9a62`, re-author steps 0041-0136: the seed was a
// navigate, an optional "Decline" press joined at a `builtin.control.merge`, a
// "Not now" press, a type into the search box and two list reads. The brief and
// every round's instruction said steps 1-5 were `not_run_in_this_build` and must
// each be rerun live, "rerunning a step with the parameters it has is how it
// comes to have run". The domain refuses a live run of an element-acting node
// whose parameters name no handle (`target_not_a_handle`), and a carried press
// keeps `element {tagName, accessibleName}` and no handle, so every rerun of step
// 5 was refused, for five rounds, until the budget ran out. Meanwhile the test
// could already run an unchanged carried step fresh from its scheduled
// candidate (`../../../flow-draft/scheduled-candidate/`), and a carried Merge has
// nothing to run at all: it only joins the optional step's two ways.
//
// So: an unchanged carried step with a candidate is not listed anywhere; the
// carried Merge passes through the gate, the replay and the listing; and the
// brief and the round instruction order no rerun of an unchanged step.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../model/index.ts";
import {
  automationStudioFlowBootstrapJudgeUnfinished,
  automationStudioFlowBootstrapJudgementValue,
  automationStudioFlowBootstrapStepsNotRunInThisBuild
} from "../../../flow-bootstrap/unfinished-build/index.ts";
import { automationStudioFlowDraftReplayable, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioLlmEvidenceResumeEntry } from "../../../llm/evidence-loop/index.ts";
import { automationStudioFlowDraftCopyScheduledCandidate } from "../../../flow-draft/scheduled-candidate/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/index.ts";
import {
  automationStudioFlowDraftDryRunGate,
  automationStudioFlowDraftSeedFromFlow,
  replayAutomationStudioFlowDraft,
  type AutomationStudioFlowDraftReplayInput
} from "../../../llm/node-tools/index.ts";
import { automationStudioReauthorBrief, automationStudioResultRepairHistoryEntry } from "../../../recovery/refuted-result/index.ts";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";

const HOME = "http://127.0.0.1:60760/scenarios/everything-store/";
const RESULTS = "http://127.0.0.1:60760/scenarios/everything-store/search?q=wireless+earbuds";
const MERGE = "builtin.control.merge";

const declared = { declaredConsequences: [] };
const node = (id: string, definitionId: string, parameterValues: JsonObject, metadata?: JsonObject): AutomationStudioFlowNode =>
  ({ id, definitionId, parameterValues, ...(metadata ? { metadata } : {}) });
const wire = (id: string, sourceNodeId: string, targetNodeId: string, sourcePortId?: string): AutomationStudioFlowEdge =>
  ({ id, sourceNodeId, targetNodeId, ...(sourcePortId ? { sourcePortId } : {}) });

/** The stored Flow of the run's re-author (debug Stage 3), its Merge with no declaration as the store keeps it. */
function storedFlow(): { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[]; startPages: Record<string, JsonObject> } {
  const read = (maxPages: number): JsonObject => ({ extractList: { item: "main > div.row", fields: { name: { kind: "text", required: false } }, paginate: { next: "nav > a:nth-of-type(4)", maxPages } }, timeoutMs: 15000 });
  return {
    nodes: [
      node("main.s1", "web.output.browser-navigate", { url: HOME, newTab: false }, declared),
      node("main.s2", "web.output.dom-click", { element: { tagName: "button", accessibleName: "Decline" }, timeoutMs: 10000 }, declared),
      node("main.s3", MERGE, { mergeMode: "first" }),
      node("main.s4", "web.output.dom-click", { element: { tagName: "button", accessibleName: "Not now" }, timeoutMs: 10000 }, declared),
      node("main.s5", "web.output.dom-type", { text: "wireless earbuds", submit: true, element: { tagName: "input", accessibleName: "Search Brightaisle" }, timeoutMs: 10000 }, declared),
      node("main.s6", "web.output.dom-extract_list", read(1), declared),
      node("main.s7", "web.output.dom-extract_list", read(50), declared)
    ],
    edges: [
      wire("e1", "main.s1", "main.s2"),
      wire("e2", "main.s2", "main.s3", "success"),
      wire("e3", "main.s2", "main.s3", "failed"),
      wire("e4", "main.s3", "main.s4"),
      wire("e5", "main.s4", "main.s5"),
      wire("e6", "main.s5", "main.s6"),
      wire("e7", "main.s6", "main.s7")
    ],
    // What the refuted run's host captured where each action node started; a Merge is no page act and has none.
    startPages: { "main.s1": { location: HOME }, "main.s2": { location: HOME }, "main.s4": { location: HOME }, "main.s5": { location: HOME }, "main.s6": { location: RESULTS }, "main.s7": { location: RESULTS } }
  };
}

/**
 * The steps a round's loop starts from, as the loop copies its seed
 * (`automationStudioLlmEvidenceLoopSeedSteps`, `../../../llm/loop-configuration.ts`):
 * renumbered, each copy keeping its scheduled candidate.
 */
function loopSeed(draft: { seed: readonly AutomationStudioFlowDraftStep[] }): AutomationStudioFlowDraftStep[] {
  return draft.seed.map((step, index) => {
    const copy = { ...step, position: index + 1 };
    automationStudioFlowDraftCopyScheduledCandidate(step, copy);
    return copy;
  });
}

/** A read the re-author reran live in this build, in the place of the carried step it stands for. */
function rerunRead(position: number, standsFor: string): AutomationStudioFlowDraftStep {
  const input = { node: "web.output.dom-extract_list", parameters: { extractList: { item: "main > div.row", fields: { name: { kind: "text", required: false } } } }, consequences: [] };
  return {
    position, id: `d${position + 10}`, iteration: position, callId: `call.${position}`, actionId: "web.output.dom-extract_list", toolId: "core.run_node",
    input, effect: "observe", disposition: "kept", proposes: true, standsFor, ranWith: structuredClone(input), replay: { from: { location: RESULTS } }
  };
}

/** The draft of the run's later rounds: steps 1-5 carried unchanged, the two reads rerun with the fix (0054-0055). */
function roundDraft(): AutomationStudioFlowDraftStep[] {
  const seed = automationStudioFlowDraftSeedFromFlow(storedFlow());
  const steps = loopSeed({ seed: seed.steps });
  steps[5] = rerunRead(6, "f6");
  steps[6] = rerunRead(7, "f7");
  return steps;
}

/** The web build's catalog, as far as the test reads it: a page act names its fixed output; a Merge has none. */
const nodeOf: NonNullable<AutomationStudioFlowDraftReplayInput["nodeOf"]> = (id) => id === MERGE
  ? { inputs: [{ id: "branches" }], outputs: [] }
  : { inputs: [], outputs: [], outputAction: { required: true, fixed: id } };

const answer = (code: string, effectApplied: boolean): AutomationStudioLlmEvidenceToolExecutionResult =>
  ({ kind: "llm_evidence_tool_execution", evidence: { said: code }, effectApplied, resultCode: code });

/** A host that runs every call it is sent, and keeps each. A Merge sent to it is a call the domain cannot run. */
function host() {
  const calls: JsonObject[] = [];
  const executeTool = async ({ value }: { value: JsonObject }) => {
    calls.push(value);
    if (value.node === MERGE) return answer("core.replay.failed", false);
    return answer("core.replay.replayed", true);
  };
  return { calls, executeTool };
}

function gate(steps: AutomationStudioFlowDraftStep[], executeTool: AutomationStudioFlowDraftReplayInput["executeTool"], shown: JsonObject[] = []) {
  return automationStudioFlowDraftDryRunGate({
    enabled: true, requireRunnable: true, requireLibrarySteps: true, steps, executeTool, nodeOf,
    accountEvidence: () => 0, showEvidence: ({ value }) => { shown.push(value as JsonObject); }, targetMoved: () => undefined
  });
}

function brief(): string {
  const summary: AutomationStudioRunResultSummary = {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 30, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{ datasetId: "web.output.dom-extract_list", recordCount: 30, refusedCount: 0, truncated: false, columns: ["name"], columnsWithheld: false, rowsChecked: 30, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: [{ name: "Pulsebud Neo" }] }],
    flowShape: [{ nodeId: "main.s7", definitionId: "web.output.dom-extract_list", parameters: {} }],
    withheld: false
  };
  const outcome: AutomationStudioResultVerificationOutcome = {
    schemaVersion: "automation-studio.result-verification.v1",
    performed: true, verdict: "does_not_answer", basis: "model", code: "core.result.does_not_answer_request",
    reason: "The result was judged not to answer the request.", observation: "30 records stored.",
    repair: { schemaVersion: "automation-studio.result-repair-directive.v1", findings: [{ code: "result.counts_look_right", detail: "detail" }], fix: [], judgement: { advice: "Drop the unfiltered read." } }
  };
  return automationStudioReauthorBrief({
    projectId: "p", flowId: "f", current: automationStudioResultRepairHistoryEntry({ attempt: 1, outcome, summary, nodeId: "main.s7" }), history: [], maxAttempts: 3, now: 5
  }).body;
}

describe("a re-author's draft whose carried steps are unchanged (run-muw60j7c-bb7c9a62, C-4)", () => {
  it("lists none of them as not run in this build, the carried Merge included", () => {
    expect(automationStudioFlowBootstrapStepsNotRunInThisBuild(roundDraft())).toEqual([]);
  });

  it("is admitted by the gate and run whole: each carried press and the type as saved, the Merge never sent", async () => {
    const { calls, executeTool } = host();
    const shown: JsonObject[] = [];
    const steps = roundDraft();
    expect(await gate(steps, executeTool, shown)()).toBeUndefined();
    expect(shown).toEqual([]);
    expect(calls.map((call) => call.replay)).toEqual(["reset", "step", "step", "step", "step", "step", "step"]);
    expect(calls.some((call) => call.node === MERGE)).toBe(false);
    // The type goes as the Flow saved it: its stored element, no handle, its declaration and where its node started.
    expect(calls.find((call) => call.node === "web.output.dom-type")).toMatchObject({
      replay: "step", from: { location: HOME }, consequences: [],
      parameters: { text: "wireless earbuds", submit: true, element: { tagName: "input", accessibleName: "Search Brightaisle" } }
    });
    // Nothing performed is claimed of a carried step: the test ran it, the build did not.
    expect(steps[4]!.ranWith).toBeUndefined();
  });

  it("does not fail the replay on the carried Merge", async () => {
    const { executeTool } = host();
    const replay = await replayAutomationStudioFlowDraft({ steps: roundDraft(), attempt: 1, executeTool, nodeOf });
    expect(replay.verdict.outcomes.map((outcome) => outcome.step)).toEqual([1, 2, 4, 5, 6, 7]);
    expect(replay.verdict.ok).toBe(true);
  });

  it("is tested when a round stops short, and the next round is told to rerun nothing", async () => {
    const { executeTool } = host();
    let tested = 0;
    const judged = await automationStudioFlowBootstrapJudgeUnfinished({
      round: 0, stopped: "unusable_decisions", steps: roundDraft(), lastIssueCodes: [],
      test: async (steps) => { tested += 1; return await gate(steps, executeTool)(); },
      replayable: automationStudioFlowDraftReplayable, checklist: () => []
    });
    expect(judged.kind).toBe("judged");
    if (judged.kind !== "judged") return;
    expect(tested).toBe(1);
    expect(judged.judgement.tested).toBe("replayed_clean");
    expect(judged.judgement.notRunInThisBuild).toBeUndefined();
    const value = automationStudioFlowBootstrapJudgementValue(judged.judgement);
    expect(value.notRunInThisBuild).toBeUndefined();
    const instruction = automationStudioLlmEvidenceResumeEntry({ revision: 2, stopped: "unusable_decisions", outstandingIssueCodes: [], judgement: value }, judged.seed).value.instruction as string;
    expect(instruction).not.toMatch(/rerun/u);
    // The next round starts from that seed, and its carried steps are still the saved Flow's, so its test runs them as saved.
    expect(automationStudioFlowBootstrapStepsNotRunInThisBuild(loopSeed({ seed: judged.seed }))).toEqual([]);
    expect(await gate(loopSeed({ seed: judged.seed }), host().executeTool)()).toBeUndefined();
  });

  it("is never ordered rerun by the brief: unchanged steps run as saved, a changed step runs with its change", () => {
    const body = brief();
    expect(body).not.toMatch(/rerun each step|still rerun live|rerunning a step with the parameters it has/u);
    expect(body).toContain("each step you leave unchanged is run as the Flow saved it, and each step you change is run with your change");
    const whatToDo = body.slice(body.indexOf("What to do:"));
    expect(whatToDo).toMatch(/5\. Change only what the findings require[^\n]*the test runs it as the Flow saved it/u);
  });
});

describe("a carried step the test cannot run as saved", () => {
  it("is still listed, by number, with why: one changed since it was saved, or one whose start was never captured", async () => {
    const flow = storedFlow();
    delete flow.startPages["main.s4"];
    const steps = loopSeed({ seed: automationStudioFlowDraftSeedFromFlow(flow).steps });
    steps[1]!.input.parameters = { element: { tagName: "button", accessibleName: "Reject all" }, timeoutMs: 10000 };
    expect(automationStudioFlowBootstrapStepsNotRunInThisBuild(steps)).toEqual([2, 4]);
    const shown: JsonObject[] = [];
    const { calls, executeTool } = host();
    const refused = await gate(steps, executeTool, shown)();
    expect(refused).toEqual({ issueCodes: ["llm_evidence_loop.full_run_required"] });
    expect(refused !== "cancelled" && refused?.steps).toEqual([2, 4]);
    expect(shown[0]).toMatchObject({ steps: [{ step: 2, replayed: "not_run_in_this_build" }, { step: 4, replayed: "not_run_in_this_build" }] });
    expect(calls).toEqual([]);
  });
});
