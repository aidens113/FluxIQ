import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../../../flow-draft/index.ts";
import {
  automationStudioActivityCompletionRefusal,
  automationStudioActivityDecision,
  automationStudioActivityDraftEditCard,
  automationStudioActivityReasonText,
  automationStudioActivityRecoveryChoice
} from "../index.ts";
import { activityActionOf } from "../../../../../../ui/index.ts";

const QUOTE = { tagName: "button", role: "button", accessibleName: "Get a free quote" };

describe("automationStudioActivityReasonText", () => {
  it("collapses whitespace, hides token-shaped runs and bounds the text", () => {
    expect(automationStudioActivityReasonText("  Click   the\n quote button ")).toBe("Click the quote button");
    expect(automationStudioActivityReasonText(`Open ${"a".repeat(40)} now`)).toBe("Open … now");
    expect(automationStudioActivityReasonText(`Use ref ${"ab12".repeat(6)} here`)).toBe("Use ref … here");
    expect(automationStudioActivityReasonText("Open the internationalization settings")).toBe("Open the internationalization settings");
    expect(automationStudioActivityReasonText("Ignore the PRIVATE KEY block")).toBeUndefined();
    const long = automationStudioActivityReasonText("word ".repeat(100));
    expect(long!.length).toBe(240);
    expect(long!.endsWith("…")).toBe(true);
    expect(automationStudioActivityReasonText("word ".repeat(100), 20)!.length).toBeLessThanOrEqual(20);
  });

  // U4, live run `run-musp39u8-9ac026ab` (moments 6, 33, 35): the person's chat
  // read "extraction.4", "extract_list" and "(step 7)" from the model's summary.
  it("screens handles, internal node ids and draft step references, and keeps the rest of the words", () => {
    expect(automationStudioActivityReasonText("Reading page 3's results with the detected list `extraction.4` (t2134), so the draft's extract_list pages to the end."))
      .toBe("Reading page 3's results with the detected list, so the draft's list reader pages to the end.");
    expect(automationStudioActivityReasonText("Rerunning the search step (step 7) with web.output.dom-extract, then press t12."))
      .toBe("Rerunning the search step with dom extract, then press.");
    // An address keeps its own words, and so does a sentence with no internal names.
    expect(automationStudioActivityReasonText("Open https://shop.example/search_results?q=a_b to compare 1.7L kettles in e2e order."))
      .toBe("Open https://shop.example/search_results?q=a_b to compare 1.7L kettles in e2e order.");
  });

  it("says nothing for an empty or non-string reason", () => {
    expect(automationStudioActivityReasonText("   ")).toBeUndefined();
    expect(automationStudioActivityReasonText(undefined)).toBeUndefined();
    expect(automationStudioActivityReasonText(42)).toBeUndefined();
  });
});

describe("automationStudioActivityDecision", () => {
  it("names a tool call by its action, exploring", () => {
    expect(automationStudioActivityDecision({ kind: "tool_call", callId: "c1", toolId: "core.run_node", input: { node: "web.output.dom-click", parameters: { element: QUOTE } } }))
      .toEqual({ phase: "exploring", title: "Clicking “Get a free quote”" });
  });

  it("names a draft edit building and a completion verifying", () => {
    expect(automationStudioActivityDecision({ kind: "amend_draft", amendments: [] })).toEqual({ phase: "building", title: "Changing the Flow" });
    expect(automationStudioActivityDecision({ kind: "tool_call", callId: "c2", toolId: AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, input: {} })).toEqual({ phase: "building", title: "Changing the Flow" });
    expect(automationStudioActivityDecision({ kind: "complete", result: {} })).toEqual({ phase: "verifying", title: "Checking whether the Flow is finished" });
  });

  it("names nothing it cannot read", () => {
    expect(automationStudioActivityDecision({ kind: "something_else" })).toBeUndefined();
    expect(automationStudioActivityDecision(null)).toBeUndefined();
    expect(automationStudioActivityDecision([])).toBeUndefined();
  });
});

describe("automationStudioActivityCompletionRefusal", () => {
  it("says why in words and how many things to fix, never a code", () => {
    const text = automationStudioActivityCompletionRefusal({
      issueCodes: ["bootstrap.handle_unresolved", "bootstrap.invalid_plan"],
      feedback: { refusal: "flow_bootstrap.evidence_completion_parameters_unresolved", refusals: ["flow_bootstrap.evidence_completion_parameters_unresolved", "flow_bootstrap.evidence_completion_cannot_answer"] }
    });
    expect(text).toBe("Sent back because some steps point at things that weren't seen on the page and it doesn't yet do everything that was asked. 2 things need fixing.");
    expect(text).not.toMatch(/[a-z]+\.[a-z_]+/u);
  });

  // R3c, live run `run-musp39u8-9ac026ab`: a completion the test refused after
  // the check passed read as finishing. It is said as sent back, and why.
  it("says a completion the test refused as sent back, with how many steps, never a code", () => {
    expect(automationStudioActivityCompletionRefusal({ issueCodes: ["llm_evidence_loop.full_run_required"], steps: [1, 3, 7] }))
      .toBe("Sent back because some of its steps haven't run in this build, so the whole Flow can't be tested from its start yet. 3 steps need fixing.");
    expect(automationStudioActivityCompletionRefusal({ issueCodes: ["llm_evidence_loop.full_run_required"], steps: [2] }))
      .toBe("Sent back because some of its steps haven't run in this build, so the whole Flow can't be tested from its start yet. One step needs fixing.");
    expect(automationStudioActivityCompletionRefusal({ issueCodes: ["llm_evidence_loop.dry_run_refused", "core.replay.failed"], steps: [4] }))
      .toBe("Sent back because its test run from the start didn't go through. One step needs fixing.");
  });

  it("falls back to plain words when the codes name no known reason", () => {
    expect(automationStudioActivityCompletionRefusal({ issueCodes: ["core.plan.empty"], feedback: {} })).toBe("It needs changes before it can be used, and it goes back to be fixed. One thing needs fixing.");
  });
});

describe("automationStudioActivityRecoveryChoice", () => {
  it("says what each ladder outcome does and why", () => {
    expect(automationStudioActivityRecoveryChoice({ kind: "retry", rung: "retry_node" }).title).toBe("Trying the step again");
    expect(automationStudioActivityRecoveryChoice({ kind: "retry", rung: "await_recorded_state" }).title).toBe("Waiting for the page to catch up");
    expect(automationStudioActivityRecoveryChoice({ kind: "retry", rung: "clear_interference" }).title).toBe("Clearing what was in the way");
    expect(automationStudioActivityRecoveryChoice({ kind: "satisfied", rung: "skip_satisfied_node" }).title).toBe("Moving on: the step's result is already there");
    expect(automationStudioActivityRecoveryChoice({ kind: "stop" }).title).toBe("The quick fixes didn't help");
    for (const kind of ["retry", "satisfied", "stop"]) expect(automationStudioActivityRecoveryChoice({ kind }).text).toMatch(/\.$/u);
  });
});

// t252: a rerun refused because the step holds a binding says why in a person's words.
// t193 1003 (C13): it is a card, "Edit the Flow · run the step again", saying it was not done.
describe("automationStudioActivityDraftEditCard for a bound step", () => {
  it("says the step varies and runs only in the Flow, on a card, never the code", () => {
    const row = automationStudioActivityDraftEditCard({ kind: "refused", reasons: ["rerun_holds_binding"], applied: 0 });
    expect(row).toMatchObject({
      phase: "building",
      label: "Not done: running the step again — that step takes a value that varies, which is known only when the Flow runs",
      detail: { kind: "tool", title: "Running the step again", status: "failed", ref: AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID }
    });
    const action = activityActionOf(row);
    expect(action).toMatchObject({ kind: "draft", target: "run the step again", outcome: "failed" });
    expect(action?.refused?.because).toMatch(/only when the Flow runs/u);
    expect(action?.refused?.because).not.toContain("rerun_holds_binding");
  });

  it("carries only codes and a count on its record, and leaves out a reason it has no words for", () => {
    expect(automationStudioActivityDraftEditCard({ kind: "refused", reasons: ["already_in_flow", "already_in_flow", "invented"], applied: 0 }).detail?.text)
      .toBe("Result: llm_evidence_loop.draft_amendments_refused · Reason: already_in_flow");
    expect(automationStudioActivityDraftEditCard({ kind: "repeated", outcome: "a sentence, not a code" }).detail?.text).toBe("Result: llm_evidence_loop.repeat_refused");
    expect(automationStudioActivityDraftEditCard({ kind: "landed" }).detail).not.toHaveProperty("text");
  });

  // U2 (`run-muw60unq-591e23bd`): "Edit the Flow · Done" said nothing of an edit that dropped Add to cart.
  it("carries what an edit changed last on its record, in words, and the card shows it as its result", () => {
    const landed = automationStudioActivityDraftEditCard({ kind: "landed" }, "removed step 9, Add to cart");
    expect(landed).toMatchObject({ label: "Changing the Flow — done: removed step 9, Add to cart", detail: { status: "succeeded", text: "Changed: removed step 9, Add to cart" } });
    expect(activityActionOf(landed)).toMatchObject({ kind: "draft", outcome: "done", result: "removed step 9, Add to cart" });
    const partly = automationStudioActivityDraftEditCard({ kind: "refused", reasons: ["already_so"], applied: 1 }, "added step 11, Spain");
    expect(partly.detail?.text).toBe("Result: llm_evidence_loop.draft_amendments_refused · Reason: already_so · Applied: 1 · Changed: added step 11, Spain");
    expect(activityActionOf(partly)).toMatchObject({ outcome: "done", result: "added step 11, Spain", refused: { all: false } });
    // An edit that changed nothing says no change, whatever it is handed.
    const refused = automationStudioActivityDraftEditCard({ kind: "refused", reasons: ["already_out"], applied: 0 }, "removed step 9, Add to cart");
    expect(refused.detail?.text).not.toContain("Changed");
    expect(refused.label).toBe("Not done: changing the Flow — that step is already out of the Flow");
    expect(activityActionOf(refused)).not.toHaveProperty("result");
  });
});
