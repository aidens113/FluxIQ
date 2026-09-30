import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, automationStudioLlmDecisionContextEntry } from "../index.ts";
import { answered, bytes, call, recorded, refusedCompletion } from "./history-fixtures.ts";

const LARGE = 100_000;

describe("decision history entry", () => {
  it("is absent until a decision at iteration 1 or later is recorded", () => {
    const recorder = recorded([[0, { kind: "look", callId: "look-0", toolId: "core.observe", resultCode: "web.observe.succeeded" }]]);
    expect(automationStudioLlmDecisionContextEntry({ records: recorder.records(), maxBytes: LARGE })).toBeUndefined();
    recorder.record(1, call("c1", "open"));
    const entry = automationStudioLlmDecisionContextEntry({ records: recorder.records(), maxBytes: LARGE });
    expect(entry?.callId).toBe("core.evidence_history");
    expect(entry?.toolId).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID);
  });

  it("groups consecutive identical decisions with their exact iterations, and points a repeat at its first time", () => {
    const recorder = recorded([
      [0, { kind: "look", callId: "look-0", toolId: "core.observe", resultCode: "web.observe.succeeded" }],
      [1, call("c1", "open")],
      [2, call("c2", "snap", { changed: "no", resultCode: "web.inspect.succeeded" })],
      [3, answered("snap", "c2")],
      [4, answered("snap", "c2")],
      [5, { kind: "redirect", code: "llm_evidence_loop.no_progress" }],
      [5, answered("snap", "c2")],
      [6, refusedCompletion({ script: "a" }, ["flow_bootstrap.missing_act"], 2, { code: "flow_bootstrap.completion_refused", missingActs: [{ id: "pick-store" }] })],
      [7, refusedCompletion({ script: "a" }, ["flow_bootstrap.missing_act"], 2, { code: "flow_bootstrap.completion_refused", missingActs: [{ id: "pick-store" }] })],
      // The same result against a changed draft is a new attempt, so a new row.
      [8, refusedCompletion({ script: "a" }, ["flow_bootstrap.missing_act"], 3, { code: "flow_bootstrap.completion_refused", missingActs: [{ id: "pick-store" }] })]
    ]);
    const value = automationStudioLlmDecisionContextEntry({ records: recorder.records(), maxBytes: LARGE })!.value as Record<string, unknown>;
    const feedback = { feedback: { code: "flow_bootstrap.completion_refused", missingActs: [{ id: "pick-store" }] } };
    expect(value).toMatchObject({
      code: "llm_evidence_loop.decision_history",
      format: "decision_rows_v1",
      fields: ["at", "kind", "toolId", "actionId", "callId", "code", "changed", "detail", "sameAs"],
      redirects: { "llm_evidence_loop.no_progress": [5] }
    });
    expect(value.rows).toEqual([
      [0, "look", "core.observe", null, "look-0", "web.observe.succeeded"],
      [1, "call", "core.run_node", "open", "c1", "web.action.succeeded", "yes"],
      [2, "call", "core.run_node", "snap", "c2", "web.inspect.succeeded", "no"],
      [[3, 4, 5], "answered", "core.run_node", "snap", "c2", "llm_evidence_loop.already_answered", null, null, 2],
      [[6, 7], "completion", null, null, null, "flow_bootstrap.missing_act", null, feedback],
      [8, "completion", null, null, null, "flow_bootstrap.missing_act", null, feedback]
    ]);
    expect(value.omitted).toBeUndefined();
    expect(bytes(value.instruction)).toBeLessThanOrEqual(350);
  });

  it("shows no string that is not a closed code: a sentence becomes an absent cell", () => {
    const recorder = recorded([
      [1, call("c1", "pick the Millbrook store", { resultCode: "The press did nothing at all" })],
      [2, { kind: "amendment", signature: "s", applied: 0, refusals: [{ step: 4, reason: "because it looked wrong", repeated: false }], withdrewChanged: [] }],
      [3, { kind: "redirect", code: "you are going round in circles" }]
    ]);
    const value = automationStudioLlmDecisionContextEntry({ records: recorder.records(), maxBytes: LARGE })!.value as Record<string, unknown>;
    expect(value.rows).toEqual([
      [1, "call", "core.run_node", null, "c1", null, "yes"],
      [2, "amendment", null, null, null, "refused", null, { applied: 0, refused: [[4, null, false]] }]
    ]);
    expect(value.redirects).toEqual({ no_progress: [3] });
    expect(JSON.stringify(value.rows)).not.toMatch(/Millbrook|press did|looked wrong|circles/);
  });

  it("shows what an amendment withdrew, undid and reran", () => {
    const recorder = recorded([
      [21, { kind: "amendment", signature: "s21", applied: 2, refusals: [{ step: 9, reason: "no_such_step", repeated: true }], withdrewChanged: [12], undoneTo: 11, rerun: 4 }]
    ]);
    const value = automationStudioLlmDecisionContextEntry({ records: recorder.records(), maxBytes: LARGE })!.value as Record<string, unknown>;
    expect(value.rows).toEqual([
      [21, "amendment", null, null, null, "no_such_step", null, { applied: 2, refused: [[9, "no_such_step", true]], withdrewChanged: [12], undoneTo: 11, rerun: 4 }]
    ]);
  });

  it("shows a dry run's refused steps and a clean dry run on the completion row", () => {
    const recorder = recorded([
      [22, { kind: "completion", signature: "c", draftRevision: 5, accepted: true, issueCodes: [], dryRun: [{ step: 4, status: "diverged" }, { step: 11, status: "failed" }] }],
      [30, { kind: "completion", signature: "d", draftRevision: 6, accepted: true, issueCodes: [], dryRun: "clean" }]
    ]);
    const value = automationStudioLlmDecisionContextEntry({ records: recorder.records(), maxBytes: LARGE })!.value as Record<string, unknown>;
    expect(value.rows).toEqual([
      [22, "completion", null, null, null, "dry_run_refused", null, { dryRun: [[4, "diverged"], [11, "failed"]] }],
      [30, "completion", null, null, null, "accepted", null, { dryRun: "clean" }]
    ]);
  });
});
