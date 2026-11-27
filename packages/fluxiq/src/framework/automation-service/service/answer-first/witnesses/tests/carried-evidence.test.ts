// t1075 D, on `run-mwynbry2-f3c88dc7`: attempt 3's replay passed the carried "+ Add" over as already done, and its judge
// said unsure (0101): the item had to be rated 4.5 stars or more, and nothing it was shown held the read the press was
// chosen from. Now an attempt's acts keep the trail entries they landed with, and the judge of a later attempt carrying
// them is shown those entries ahead of its own trail. Through the real Flow-less judge with a scripted provider: no model.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActSeed } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../../../../runtime/llm/index.ts";
import { automationStudioLlmTaskMessages } from "../../../../../../runtime/llm/provider-task/index.ts";
import { automationStudioFlowLessJudge, type AutomationStudioFlowLessSummary, type AutomationStudioResultTrailStep } from "../../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstActEvidence, automationStudioAnswerFirstCarriedEvidenceOf, automationStudioAnswerFirstCarriedTrail } from "../index.ts";
import { RUN_MWYNBRY2_ACTION, RUN_MWYNBRY2_RAN_WITH } from "../../../../../../runtime/answer-first/act-record/tests/run-mwynbry2-add.ts";

const STORE = { selector: "#store-picker .set", element: { tagName: "button", accessibleName: "Set as my store" } };
const LISTED = "ValueRidge Essentials Paper Towels, 1 Roll | $1.28 | 4.6 stars | Pickup today";

/** Attempt 1 as its chain recorded it: the store set, a search, the list the towels were chosen from, then "+ Add". */
function firstAttempt() {
  const record = new AutomationStudioAttemptActRecord();
  record.settled({ actionId: RUN_MWYNBRY2_ACTION, parameters: STORE, consequences: ["modify_existing"], stage: "exploration", callId: "c3" }, { effectApplied: true, words: { what: "Set as my store", where: "On the site" } });
  record.settled({ actionId: RUN_MWYNBRY2_ACTION, parameters: { target: { handle: "t1125" } }, consequences: ["modify_existing"], stage: "exploration", callId: "c9" }, { effectApplied: true, words: { what: "+ Add", where: "On the site" }, ranWith: { parameters: RUN_MWYNBRY2_RAN_WITH } });
  const add = record.calls.actOf("c9")!;
  const trail: AutomationStudioResultTrailStep[] = [
    { callId: "c3", did: RUN_MWYNBRY2_ACTION, on: "Set as my store", outcome: "succeeded", found: { changed: ["\"Your store: Millbrook Crossing\" appeared"] } },
    { callId: "c5", did: "web.output.dom-type", on: "Search", outcome: "succeeded", found: { location: "/search?q=paper+towels" } },
    { callId: "c7", did: "web.output.dom-extract_list", on: "search results", outcome: "succeeded", found: { rows: [LISTED] }, judgeSource: { source: "c7", datasetId: "result" } },
    { callId: "c9", did: RUN_MWYNBRY2_ACTION, on: "+ Add", outcome: "succeeded", found: { changed: ["\"Added\" appeared"] }, judgeAct: { callId: "c9", actId: add } }
  ];
  return { record, trail, add, store: record.calls.actOf("c3")! };
}

const ownOf = (record: AutomationStudioAttemptActRecord) => new Set(record.data().acts.filter((act) => act.carried !== true).map((act) => act.id));
const carriedOf = (record: AutomationStudioAttemptActRecord) => record.data().acts.filter((act) => act.carried === true).map((act) => act.id);

function scripted(): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "yes", defects: [], checked: [], answerRecords: { asked: false } } }, usage: { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 } } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

describe("the trail entries an attempt's acts landed with", () => {
  it("are, for each act, what the attempt did after its previous act up to the act itself, without what names its own result", () => {
    const { record, trail, add, store } = firstAttempt();
    const evidence = automationStudioAnswerFirstActEvidence({ trail, actOfCall: (callId) => record.calls.actOf(callId), own: ownOf(record) });
    expect(evidence.get(store)?.map((step) => step.on)).toEqual(["Set as my store"]);
    expect(evidence.get(add)?.map((step) => step.on)).toEqual(["Search", "search results", "+ Add"]);
    for (const step of evidence.get(add) ?? []) {
      expect(step).not.toHaveProperty("callId");
      expect(step).not.toHaveProperty("judgeSource");
      expect(step).not.toHaveProperty("judgeAct");
    }
  });

  it("are handed from attempt to attempt, so a third attempt carrying the first's acts through the second's still has them", () => {
    const held = automationStudioAnswerFirstCarriedEvidenceOf({});
    const first = firstAttempt();
    held.hold("attempt-1", () => automationStudioAnswerFirstActEvidence({ trail: first.trail, actOfCall: (callId) => first.record.calls.actOf(callId), own: ownOf(first.record) }));
    const second = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: first.record.data() })! });
    const handed = held.get("attempt-1");
    held.hold("attempt-2", () => new Map([...(handed ?? []), ...automationStudioAnswerFirstActEvidence({ trail: [], actOfCall: (callId) => second.calls.actOf(callId), own: ownOf(second) })]));
    expect(held.get("attempt-2")?.get(first.add)?.map((step) => step.on)).toEqual(["Search", "search results", "+ Add"]);
    expect(automationStudioAnswerFirstCarriedTrail(carriedOf(second), held.get("attempt-2")).length).toBe(6);
    expect(automationStudioAnswerFirstCarriedTrail(carriedOf(second), undefined)).toEqual([]);
  });

  it("reach the judge of an attempt whose replay passed the carried \"+ Add\" over: the act, the list it was chosen from, and the press", async () => {
    const first = firstAttempt();
    const evidence = automationStudioAnswerFirstActEvidence({ trail: first.trail, actOfCall: (callId) => first.record.calls.actOf(callId), own: ownOf(first.record) });
    const later = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: first.record.data() })! });
    const replay: AutomationStudioResultTrailStep = { did: RUN_MWYNBRY2_ACTION, on: "+ Add", outcome: "succeeded, route success", found: { role: "action", evidence: { action: { skipped: "already_done" } } } };
    const summary: AutomationStudioFlowLessSummary = {
      instructions: "Find the lowest-priced paper towels rated 4.5 stars or higher for pickup today and add one to my cart.",
      acts: later.acts(),
      trail: [...automationStudioAnswerFirstCarriedTrail(carriedOf(later), evidence), replay],
      endView: { after: "end", view: { lines: ["Cart (2 items)"] } }
    };
    const { provider, seen } = scripted();
    await automationStudioFlowLessJudge({ summary, provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: [] });
    const sent = seen[0]!.context.resultSummary as unknown as { acts: { what: string }[]; trail: { entries: (AutomationStudioResultTrailStep & JsonObject)[] } };
    expect(sent.acts.map((act) => act.what)).toContain("Already done earlier: + Add");
    const entries = sent.trail.entries.map((entry) => [entry.did, entry.on ?? null]);
    expect(entries).toEqual([
      ["core.carried_acts_evidence", null],
      [RUN_MWYNBRY2_ACTION, "Set as my store"],
      ["web.output.dom-type", "Search"],
      ["web.output.dom-extract_list", "search results"],
      [RUN_MWYNBRY2_ACTION, "+ Add"],
      ["core.carried_acts_evidence_end", null],
      [RUN_MWYNBRY2_ACTION, "+ Add"]
    ]);
    const user = automationStudioLlmTaskMessages(seen[0]!).find((message) => message.role === "user")?.content ?? "";
    expect(user).toContain("4.6 stars");
    expect(user).toContain("did on the site to make the acts this attempt carries as already done earlier");
  });
});
