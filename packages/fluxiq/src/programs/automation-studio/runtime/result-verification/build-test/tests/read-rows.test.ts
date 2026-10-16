// What the judge of a build's test is shown of a replayed list read's rows
// (t194 w55, live run `run-muqk713g`, C3): the labels of the rows it returned,
// and per condition the rows that condition alone left out, screened as the
// runtime judge's `leftOutOnlyByThis` are (`../../read-account/alone-rows.ts`).
// Until then the judge was told "name 20 (5)" and nothing else, and passed a read
// that kept 10 of the 13 earbuds asked for.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioLlmRequestEvidenceRefusal, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioBuildTestResultSummary } from "../summary.ts";
import { DENIED, SITE, navigate, replayed, report } from "./draft-steps.ts";

const EARBUDS = "Find wireless earbuds under $50 rated 4 stars or more; leave out accessories such as ear tips or charging cases.";
const LUMO = "Lumo Audio Drift Pro Wireless Earbuds, Bluetooth 5.3, Wireless Charging Case, Touch Control, White";
const AURELLE = "Aurelle Pods Fit Wireless Earbuds, Ivory with Wireless Charging Case";
const SAID = "the step ran again: kept 10 rows from 5 pages, stopped on control_disabled; 94 items seen; per condition rejected (removed alone): price 40 (3), name 20 (2)";

const read: AutomationStudioFlowDraftStep = {
  position: 2,
  id: "d2",
  iteration: 2,
  actionId: "web.output.dom-extract_list",
  input: { node: "web.output.dom-extract_list", parameters: { extractList: { item: { handle: "e9" } } } },
  ranWith: { node: "web.output.dom-extract_list", parameters: { extractList: { item: ".card" } } },
  effect: "observe",
  proposes: true,
  disposition: "kept",
  replay: { from: { location: SITE } }
};

function judged(observation: JsonObject): AutomationStudioRunResultSummary {
  const start = navigate(1);
  return automationStudioBuildTestResultSummary({
    steps: [start, read],
    report: report([replayed(start), replayed(read)], [[read, observation]]),
    nodes: [],
    instructionText: EARBUDS,
    startLocation: SITE,
    deniedEvidenceKeys: [...DENIED, "password"]
  });
}

/** What the judge is shown of the read, step 2. */
function observedOf(summary: AutomationStudioRunResultSummary): JsonObject {
  return summary.buildTest?.steps.find((step) => step.step === 2)?.observed as JsonObject;
}

function answer(readRows: JsonObject): JsonObject {
  return { ok: true, code: "core.replay.replayed", said: SAID, readRows };
}

describe("a replayed list read's rows, as the build-test judge is shown them", () => {
  it("screens trial witnesses before flattening and preserves unknown legacy companion alignment", () => {
    const observation = { conditionIndex: 2, state: "present", value: "token sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c", source: "read", readKind: "attribute", page: 2, item: 7 };
    const summary = judged(answer({ leftOutOnlyByThis: [{ condition: "unit_flag", conditionIndex: 2,
      rows: [{ label: "Unit alpha" }, { label: "Unit beta" }], observations: [observation, null] }] }));
    expect(summary.withheld).toBe(true);
    expect(JSON.stringify(summary)).not.toContain("sk-live");
    expect(observedOf(summary)).toMatchObject({ readRows: { leftOutOnlyByThis: [{
      number: 3, rows: ["Unit alpha", "Unit beta"], observations: [{ state: "withheld", source: "read", readKind: "attribute", page: 2, item: 7 }, null]
    }] } });
    const legacy = observedOf(judged(answer({ leftOutOnlyByThis: [{ condition: "unit_flag", rows: [{ label: "Unit alpha" }], observations: [null] }] })));
    expect(legacy).toMatchObject({ readRows: { leftOutOnlyByThis: [{ rows: ["Unit alpha"], observations: [null] }] } });
    expect(JSON.stringify(legacy)).not.toContain("conditionIndex");
  });
  it("preserves the neutral trial witness companion beside its rejection labels", () => {
    const observations = [
      { conditionIndex: 0, state: "present", value: "14 plus 2", source: "read", readKind: "attribute", page: 1, item: 1 },
      { conditionIndex: 0, state: "absent", source: "read", readKind: "attribute", page: 1, item: 2 }
    ];
    const summary = judged(answer({ leftOutOnlyByThis: [{ condition: "unit_flag", conditionIndex: 0, rows: [{ label: "Unit alpha" }, { label: "Unit beta" }], observations }] }));
    // The replay's 0-based index is said as the condition's number, from 1, and its witnesses lose their copy of it (t574).
    expect(observedOf(summary)).toMatchObject({ readRows: { leftOutOnlyByThis: [{ condition: "unit_flag", number: 1, rows: ["Unit alpha", "Unit beta"], observations: observations.map(({ conditionIndex: _index, ...witness }) => witness) }] } });
    expect(JSON.stringify(observedOf(summary))).not.toContain("conditionIndex");
  });
  it("retains original condition ordinals for sparse trial groups and refuses a mismatched companion", () => {
    const observation = { conditionIndex: 4, state: "present", value: "14 plus 2", source: "read", readKind: "attribute", page: 2, item: 3 };
    const summary = judged(answer({ leftOutOnlyByThis: [{ condition: "unit_flag", conditionIndex: 4, rows: [{ label: "Unit alpha" }], observations: [observation] }] }));
    const { conditionIndex: _index, ...witness } = observation;
    expect(observedOf(summary)).toMatchObject({ readRows: { leftOutOnlyByThis: [{ number: 5, observations: [witness] }] } });
    const wrong = judged(answer({ leftOutOnlyByThis: [{ condition: "unit_flag", conditionIndex: 1, rows: [{ label: "Unit alpha" }], observations: [observation] }] }));
    expect(JSON.stringify(observedOf(wrong))).not.toContain('"observations"');
  });
  it("names once each row two or more conditions left out together, with every condition that left it out (t655)", () => {
    const summary = judged(answer({
      rows: [{ name: "Trevio T5 Wireless Earbuds, Ivory" }],
      leftOutTogether: [
        { conditions: ["price", "name"], conditionIndexes: [0, 1], rows: [{ name: "Unit gamma" }, { password: "Unit delta" }] },
        // Not two conditions: left out.
        { conditions: ["price"], conditionIndexes: [0], rows: [{ name: "Unit epsilon" }] }
      ]
    }));
    expect(observedOf(summary)).toMatchObject({ readRows: { leftOutTogether: [{ numbers: [1, 2], conditions: ["price", "name"], rows: ["Unit gamma", "(withheld)"] }] } });
    expect(JSON.stringify(observedOf(summary))).not.toContain("Unit epsilon");
    expect(summary.withheld).toBe(true);
    expect(automationStudioLlmRequestEvidenceRefusal(verificationRequest(summary))).toBeUndefined();
  });
  it("names the rows it returned and, per condition, the rows that condition alone left out, each by its label", () => {
    const summary = judged(answer({
      rows: [{ name: "Trevio T5 Wireless Earbuds, Ivory" }, { name: "Soundcrest Air Lite" }],
      rowsNotShown: 8,
      leftOutOnlyByThis: [
        { condition: "price", rows: [{ name: "Soundcrest Air Pro Max" }] },
        { condition: "name", rows: [{ name: LUMO }, { name: AURELLE }] }
      ]
    }));
    expect(observedOf(summary)).toEqual({
      ok: true,
      code: "core.replay.replayed",
      said: SAID,
      readRows: {
        rows: ["Trevio T5 Wireless Earbuds, Ivory", "Soundcrest Air Lite"],
        rowsNotShown: 8,
        leftOutOnlyByThis: [
          { condition: "price", rows: ["Soundcrest Air Pro Max"] },
          { condition: "name", rows: [LUMO, AURELLE] }
        ]
      }
    });
    expect(summary.withheld).toBe(false);
    expect(automationStudioLlmRequestEvidenceRefusal(verificationRequest(summary))).toBeUndefined();
  });

  it("says a label from a denied column or shaped like a credential as withheld, keeps the rest of the observation, and still counts the row", () => {
    const summary = judged(answer({
      rows: [{ name: "Soundcrest Air Lite" }, { password: "Trevio T5" }],
      leftOutOnlyByThis: [{ condition: "name", rows: [{ name: LUMO }, { name: "token sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c" }] }]
    }));
    const observed = observedOf(summary) as JsonObject;
    expect(observed.said).toBe(SAID);
    expect(observed.readRows).toEqual({
      rows: ["Soundcrest Air Lite", "(withheld)"],
      leftOutOnlyByThis: [{ condition: "name", rows: [LUMO, "(withheld)"] }]
    });
    expect(summary.withheld).toBe(true);
    expect(JSON.stringify(summary)).not.toContain("sk-live");
    expect(automationStudioLlmRequestEvidenceRefusal(verificationRequest(summary))).toBeUndefined();
  });

  it("leaves out rows that are not that shape, and keeps the rest of what the step said", () => {
    const summary = judged(answer({ rows: "Soundcrest Air Lite", leftOutOnlyByThis: [{ condition: "name", rows: [{ name: LUMO }] }, { rows: [{ name: AURELLE }] }] }));
    const observed = observedOf(summary) as JsonObject;
    expect(observed.said).toBe(SAID);
    expect(observed.readRows).toEqual({ leftOutOnlyByThis: [{ condition: "name", rows: [LUMO] }] });

    const nothing = observedOf(judged(answer({ rows: 3 })));
    expect(nothing).toEqual({ ok: true, code: "core.replay.replayed", said: SAID });
  });

  // t195-w34, live run `run-murwcaj0-40e56557` (R6): a regex meant to keep five or more mutual
  // friends dropped Jonas Weber, and the judge, shown his name only, called the rows left out
  // "exactly the requests with fewer than five mutual friends".
  it("says a left-out row with the value its condition tested, after its label", () => {
    const summary = judged(answer({
      rows: [{ name: "Amara Osei" }],
      leftOutOnlyByThis: [{
        condition: "div_x0531l50_x1r2vv8_x4q0id2_div_x1a4yqcp_xa73opb_xtlve1b",
        rows: [
          { name: "Tom Becker", mutualFriends: "2 mutual friends" },
          { name: "Jonas Weber", mutualFriends: "Aisha Khan and 4 other mutual friends" },
          { name: "Priya Nair", mutualFriends: "" },
          // A sender that predates the tested value sends the label alone.
          { name: "Diego Alvarez" }
        ]
      }]
    }));
    expect((observedOf(summary).readRows as JsonObject).leftOutOnlyByThis).toEqual([{
      condition: "div_x0531l50_x1r2vv8_x4q0id2_div_x1a4yqcp_xa73opb_xtlve1b",
      rows: [
        "Tom Becker — mutualFriends: 2 mutual friends",
        "Jonas Weber — mutualFriends: Aisha Khan and 4 other mutual friends",
        "Priya Nair — mutualFriends: (no value)",
        "Diego Alvarez"
      ]
    }]);
    expect(summary.withheld).toBe(false);
    expect(automationStudioLlmRequestEvidenceRefusal(verificationRequest(summary))).toBeUndefined();
  });

  it("withholds a tested value shaped like a credential, or from a denied column, and keeps the label beside it", () => {
    const summary = judged(answer({
      leftOutOnlyByThis: [{
        condition: "name",
        rows: [
          { name: "Soundcrest Air Lite", note: "token sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c" },
          { name: "Trevio T5", password: "hunter2" },
          { password: "Lumo", name: "Lumo Audio" }
        ]
      }]
    }));
    expect((observedOf(summary).readRows as JsonObject).leftOutOnlyByThis).toEqual([{
      condition: "name",
      rows: ["Soundcrest Air Lite — note: (withheld)", "Trevio T5 — (withheld)", "(withheld) — name: Lumo Audio"]
    }]);
    expect(summary.withheld).toBe(true);
    expect(JSON.stringify(summary)).not.toContain("sk-live");
    expect(JSON.stringify(summary)).not.toContain("hunter2");
    expect(automationStudioLlmRequestEvidenceRefusal(verificationRequest(summary))).toBeUndefined();
  });

  it("does not name a repeated label as another step's, since every row's label is the answer", () => {
    const summary = judged(answer({ rows: [{ name: LUMO }], leftOutOnlyByThis: [{ condition: "name", rows: [{ name: LUMO }] }] }));
    expect(JSON.stringify(observedOf(summary))).not.toContain("as step");
  });
});

function verificationRequest(summary: AutomationStudioRunResultSummary): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.one",
    idempotencyKey: "request.one",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "loop_verification",
    promptVersion: "automation-studio.loop-verification.v3",
    expectedOutput: "diagnosis",
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
    maxEstimatedCostUsd: 0.25,
    deniedEvidenceKeys: [...DENIED, "password"],
    context: {
      schemaVersion: "0.1",
      taskKind: "loop_verification",
      promptVersion: "automation-studio.loop-verification.v3",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8_000, estimatedTokens: 0 },
      resultSummary: summary
    }
  };
}
