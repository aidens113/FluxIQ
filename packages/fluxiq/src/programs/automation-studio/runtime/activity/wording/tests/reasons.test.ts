import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../../../flow-draft/index.ts";
import {
  automationStudioActivityCompletionRefusal,
  automationStudioActivityDecision,
  automationStudioActivityDraftEditRefused,
  automationStudioActivityReasonText,
  automationStudioActivityRecoveryChoice
} from "../index.ts";

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
    expect(automationStudioActivityDecision({ kind: "amend_draft", amendments: [] })).toEqual({ phase: "building", title: "Updating the draft Flow" });
    expect(automationStudioActivityDecision({ kind: "tool_call", callId: "c2", toolId: AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, input: {} })).toEqual({ phase: "building", title: "Updating the draft Flow" });
    expect(automationStudioActivityDecision({ kind: "complete", result: {} })).toEqual({ phase: "verifying", title: "Checking the Flow is finished" });
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
describe("automationStudioActivityDraftEditRefused for a bound step", () => {
  it("says the step varies and runs only in the Flow, never the code", () => {
    const card = automationStudioActivityDraftEditRefused({ reasons: ["rerun_holds_binding"] }, undefined);
    expect(card.title).toBe("Didn't run the step again");
    expect(card.text).not.toContain("rerun_holds_binding");
    expect(card.text).toMatch(/only when the Flow runs/u);
  });
});
