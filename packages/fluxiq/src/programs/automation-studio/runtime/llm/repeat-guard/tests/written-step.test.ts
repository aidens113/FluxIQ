// A written step is not an attempt the repeat guard refuses (`../outcomes.ts`, t707 D1).
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceRepeatGuard, type AutomationStudioLlmEvidenceCallOutcome } from "../outcomes.ts";

const written = (over: Partial<AutomationStudioLlmEvidenceCallOutcome> = {}): AutomationStudioLlmEvidenceCallOutcome => ({
  callId: "c1", toolId: "core.run_node", input: { node: "web.click", parameters: { target: "t7" }, write: true },
  stateBefore: "s1", stateAfter: "s1", effect: "mutate", proposes: true, effectApplied: false, refused: false,
  resultCode: "core.run_node.written", answer: JSON.stringify({ ok: true, code: "core.run_node.written" }), ...over
});

const ran = (over: Partial<AutomationStudioLlmEvidenceCallOutcome> = {}): AutomationStudioLlmEvidenceCallOutcome => ({
  callId: "c2", toolId: "core.run_node", input: { node: "web.click", parameters: { target: "t7" } },
  stateBefore: "s1", stateAfter: "s1", effect: "mutate", proposes: true, effectApplied: false, refused: true,
  resultCode: "web.action.rejected.target_covered", ...over
});

describe("a step written into the Flow and not run", () => {
  it("never makes the identical call a repeat to refuse: it was checked and added, not tried and failed", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.recorded(written());
    expect(guard.blocks("core.run_node", written().input)).toBeUndefined();
    // Written again, and again: never "did not work" or "changed nothing".
    guard.recorded(written({ callId: "c3" }));
    expect(guard.blocks("core.run_node", written().input)).toBeUndefined();
  });

  it("lets the same step be run now from the same page", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.recorded(written());
    expect(guard.blocks("core.run_node", ran().input)).toBeUndefined();
  });

  it("still refuses a run that failed, made again on the same page", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.recorded(written());
    guard.recorded(ran());
    expect(guard.blocks("core.run_node", ran().input)).toEqual({ callId: "c2", outcome: "failed", resultCode: "web.action.rejected.target_covered" });
  });

  it("still refuses a write the host refused, and a call that ignored write and acted on nothing", () => {
    const refused = automationStudioLlmEvidenceRepeatGuard();
    refused.recorded(written({ refused: true, resultCode: "web.action.rejected.target_covered", answer: JSON.stringify({ ok: false, code: "web.action.rejected.target_covered" }) }));
    expect(refused.blocks("core.run_node", written().input)?.outcome).toBe("failed");
    const ignored = automationStudioLlmEvidenceRepeatGuard();
    ignored.recorded(written({ resultCode: "web.action.succeeded" }));
    expect(ignored.blocks("core.run_node", written().input)?.outcome).toBe("failed");
  });
});
