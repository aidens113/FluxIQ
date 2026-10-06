// A re-author's carried steps stay runnable as saved from one round to the
// next, and its carried Merge is never shown, counted or announced as a step
// the test left untested (t274-c4b).
//
// Live run `run-muw60j7c-bb7c9a62`: every round of the re-author stopped
// `unusable_decisions` (48 of them in the requests). That ending deep-copied the
// round's steps, a copy keeps no scheduled candidate
// (`../../../flow-draft/scheduled-candidate/`), so the next round would list the
// unchanged carried steps 1, 2, 4 and 5 for a live rerun the domain refuses
// (`target_not_a_handle`). And the seed's Merge, which the test passes through
// and never sends, came out of the test with no outcome: the judge was shown it
// as a carried step `not_run`, the round was marked `not_tested` for it, and the
// "Testing the Flow so far" announcement was skipped because the Flow holding it
// was not `replayable`.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../model/index.ts";
import {
  automationStudioFlowBootstrapRepairSeed,
  automationStudioFlowBootstrapRoundEnding,
  automationStudioFlowBootstrapStepsNotRunInThisBuild,
  AutomationStudioFlowBootstrapUnfinishedStall
} from "../../../flow-bootstrap/unfinished-build/index.ts";
import { automationStudioFlowDraftReplayable, automationStudioFlowDraftReplayFrom, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioFlowDraftCopyScheduledCandidate } from "../../../flow-draft/scheduled-candidate/index.ts";
import { automationStudioLlmEvidenceLoopEmptyAccounting } from "../../../llm/evidence-loop/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/index.ts";
import { automationStudioFlowDraftSeedFromFlow, replayAutomationStudioFlowDraft, type AutomationStudioFlowDraftReplayInput } from "../../../llm/node-tools/index.ts";
import { automationStudioBuildTestResultSummary, automationStudioBuildTestUntestedCarried } from "../../../result-verification/index.ts";

const HOME = "http://127.0.0.1:60760/scenarios/everything-store/";
const MERGE = "builtin.control.merge";
const declared = { declaredConsequences: [] };
const node = (id: string, definitionId: string, parameterValues: JsonObject, metadata?: JsonObject): AutomationStudioFlowNode =>
  ({ id, definitionId, parameterValues, ...(metadata ? { metadata } : {}) });
const wire = (id: string, sourceNodeId: string, targetNodeId: string, sourcePortId?: string): AutomationStudioFlowEdge =>
  ({ id, sourceNodeId, targetNodeId, ...(sourcePortId ? { sourcePortId } : {}) });

/** The run's re-authored Flow up to its type (debug Stage 3): navigate, optional Decline joined at a Merge, Not now, type. */
function storedFlow(): { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[]; startPages: Record<string, JsonObject> } {
  return {
    nodes: [
      node("main.s1", "web.output.browser-navigate", { url: HOME, newTab: false }, declared),
      node("main.s2", "web.output.dom-click", { element: { tagName: "button", accessibleName: "Decline" }, timeoutMs: 10000 }, declared),
      node("main.s3", MERGE, { mergeMode: "first" }),
      node("main.s4", "web.output.dom-click", { element: { tagName: "button", accessibleName: "Not now" }, timeoutMs: 10000 }, declared),
      node("main.s5", "web.output.dom-type", { text: "wireless earbuds", submit: true, element: { tagName: "input", accessibleName: "Search Brightaisle" }, timeoutMs: 10000 }, declared)
    ],
    edges: [
      wire("e1", "main.s1", "main.s2"),
      wire("e2", "main.s2", "main.s3", "success"),
      wire("e3", "main.s2", "main.s3", "failed"),
      wire("e4", "main.s3", "main.s4"),
      wire("e5", "main.s4", "main.s5")
    ],
    startPages: { "main.s1": { location: HOME }, "main.s2": { location: HOME }, "main.s4": { location: HOME }, "main.s5": { location: HOME } }
  };
}

/** A round's steps as its loop copies the seed (`automationStudioLlmEvidenceLoopSeedSteps`): renumbered, each keeping its candidate. */
function loopSeed(seed: readonly AutomationStudioFlowDraftStep[]): AutomationStudioFlowDraftStep[] {
  return seed.map((step, index) => {
    const copy = { ...step, position: index + 1 };
    automationStudioFlowDraftCopyScheduledCandidate(step, copy);
    return copy;
  });
}

const roundDraft = (): AutomationStudioFlowDraftStep[] => loopSeed(automationStudioFlowDraftSeedFromFlow(storedFlow()).steps);

const nodeOf: NonNullable<AutomationStudioFlowDraftReplayInput["nodeOf"]> = (id) => id === MERGE
  ? { inputs: [{ id: "branches" }], outputs: [] }
  : { inputs: [], outputs: [], outputAction: { required: true, fixed: id } };

const executeTool = async (): Promise<AutomationStudioLlmEvidenceToolExecutionResult> =>
  ({ kind: "llm_evidence_tool_execution", evidence: { said: "core.replay.replayed" }, effectApplied: true, resultCode: "core.replay.replayed" });

describe("a re-author round that stopped on unusable decisions (run-muw60j7c-bb7c9a62)", () => {
  it("hands the next round its carried steps still runnable as saved", () => {
    const ending = automationStudioFlowBootstrapRoundEnding(new AutomationStudioFlowBootstrapUnfinishedStall({
      issueCodes: ["llm_evidence_loop.unusable_decision"], trace: [], accounting: automationStudioLlmEvidenceLoopEmptyAccounting(), steps: roundDraft()
    }));
    expect(ending.kind).toBe("unfinished");
    if (ending.kind !== "unfinished") return;
    expect(automationStudioFlowBootstrapStepsNotRunInThisBuild(ending.steps)).toEqual([]);
    expect(automationStudioFlowBootstrapStepsNotRunInThisBuild(loopSeed(automationStudioFlowBootstrapRepairSeed(ending.steps)))).toEqual([]);
  });
});

describe("a Flow holding a carried Merge", () => {
  it("is replayable, from its first step that is sent, so the stopped round announces its test", () => {
    const steps = roundDraft();
    expect(automationStudioFlowDraftReplayable(steps)).toBe(true);
    expect(automationStudioFlowDraftReplayFrom(steps)).toEqual({ location: HOME });
  });

  it("is judged without the Merge: not shown as a carried step not run, and not counted untested", async () => {
    const steps = roundDraft();
    const replay = await replayAutomationStudioFlowDraft({ steps, attempt: 1, executeTool, nodeOf });
    const summary = automationStudioBuildTestResultSummary({ steps, nodes: [], deniedEvidenceKeys: [], report: { verdict: replay.verdict, observations: replay.observations, reused: false } });
    expect(automationStudioBuildTestUntestedCarried(summary.buildTest)).toEqual([]);
    expect(summary.buildTest?.steps.map((step) => step.step)).toEqual([1, 2, 4, 5]);
  });
});
