import { describe, expect, it } from "vitest";
import { activityActionRecordOf } from "../record.ts";

describe("activityActionRecordOf", () => {
  it("reads the result code and the node id a tool row carries", () => {
    expect(activityActionRecordOf("Result: web.target.not_found · Node: web.output.dom-click")).toEqual({ resultCode: "web.target.not_found", node: "web.output.dom-click" });
    expect(activityActionRecordOf("Node: web.output.wait")).toEqual({ resultCode: undefined, node: "web.output.wait" });
    expect(activityActionRecordOf("Result: core.replay.replayed")).toEqual({ resultCode: "core.replay.replayed", node: undefined });
  });

  it("reads nothing from a sentence", () => {
    expect(activityActionRecordOf("The Flow never reads the list.")).toEqual({ resultCode: undefined, node: undefined });
    expect(activityActionRecordOf(undefined)).toEqual({ resultCode: undefined, node: undefined });
  });
});

describe("activityActionRecordOf: a refusal's reason", () => {
  it("reads the reason a refusal carries, between the code and the node", () => {
    expect(activityActionRecordOf("Result: web.action.rejected.target_unobserved · Reason: target_not_a_handle · Node: web.output.dom-click"))
      .toEqual({ resultCode: "web.action.rejected.target_unobserved", reason: "target_not_a_handle", node: "web.output.dom-click" });
    expect(activityActionRecordOf("Result: web.target.not_found").reason).toBeUndefined();
  });
});

describe("activityActionRecordOf: what an action came to (U-1, U2)", () => {
  it("reads a read's rows and pages, and an edit's changed words, which come last", () => {
    expect(activityActionRecordOf("Result: core.replay.replayed · Rows: 13 · Pages: 5 · Node: web.output.dom-extract_list"))
      .toEqual({ resultCode: "core.replay.replayed", rows: 13, pages: 5, node: "web.output.dom-extract_list" });
    expect(activityActionRecordOf("Result: llm_evidence_loop.draft_amendments_refused · Reason: already_so · Applied: 1 · Changed: removed step 9, Add to cart · Node: x"))
      .toEqual({ resultCode: "llm_evidence_loop.draft_amendments_refused", reason: "already_so", applied: 1, changed: "removed step 9, Add to cart · Node: x", node: undefined });
    expect(activityActionRecordOf("Changed: added step 11, Spain")).toEqual({ resultCode: undefined, changed: "added step 11, Spain", node: undefined });
    // Words in the changed part are never read as codes.
    expect(activityActionRecordOf("Changed: removed step 2, Result: web.x · Rows: 9")).toEqual({ resultCode: undefined, changed: "removed step 2, Result: web.x · Rows: 9", node: undefined });
  });
});

describe("activityActionRecordOf: Core's own words on a call's end (t373)", () => {
  it("reads a Said or a Declined part, last and whole, never as codes", () => {
    expect(activityActionRecordOf("Result: candidate.trial_yes · Reason: retry_allowed · Said: the test passed: 2 steps done, Result: x · Rows: 3"))
      .toEqual({ resultCode: "candidate.trial_yes", reason: "retry_allowed", said: "the test passed: 2 steps done, Result: x · Rows: 3", node: undefined });
    expect(activityActionRecordOf("Result: candidate.trial_stale_revision · Declined: only the latest saved steps can be tested"))
      .toEqual({ resultCode: "candidate.trial_stale_revision", declined: "only the latest saved steps can be tested", node: undefined });
    expect(activityActionRecordOf("Said: the steps were accepted")).toEqual({ resultCode: undefined, said: "the steps were accepted", node: undefined });
    // A words part names only the first marker; one inside its words is words.
    expect(activityActionRecordOf("Declined: it said Changed: nothing")).toEqual({ resultCode: undefined, declined: "it said Changed: nothing", node: undefined });
  });
});
