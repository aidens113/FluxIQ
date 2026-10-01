// The loop's record of what each call did on the page it found (`../outcomes.ts`).
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceRepeatGuard, type AutomationStudioLlmEvidenceCallOutcome } from "../outcomes.ts";

const call = (over: Partial<AutomationStudioLlmEvidenceCallOutcome> = {}): AutomationStudioLlmEvidenceCallOutcome => ({
  callId: "c1", toolId: "core.run_node", input: { node: "web.click", parameters: { target: "t7" } },
  stateBefore: "s1", stateAfter: "s1", effect: "mutate", proposes: true, effectApplied: false, refused: true,
  resultCode: "web.action.rejected.target_covered", ...over
});

describe("what a call did on the page it found", () => {
  it("blocks the same call on the same page after it failed, whatever the key order, and says how it went", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.recorded(call());
    expect(guard.blocks("core.run_node", { parameters: { target: "t7" }, node: "web.click" })).toEqual({ callId: "c1", outcome: "failed", resultCode: "web.action.rejected.target_covered" });
    expect(guard.blocks("core.run_node", { node: "web.click", parameters: { target: "t8" } })).toBeUndefined();
  });

  it("blocks a call that changed nothing, and lets one that changed the page be made again on the page it left", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.recorded(call({ effect: "observe", proposes: true, effectApplied: true, refused: false, resultCode: "web.inspect.succeeded" }));
    expect(guard.blocks("core.run_node", call().input)?.outcome).toBe("changed_nothing");
    const moved = automationStudioLlmEvidenceRepeatGuard();
    moved.recorded(call({ callId: "c2", stateAfter: "s2", effectApplied: true, refused: false, resultCode: "web.action.succeeded" }));
    expect(moved.blocks("core.run_node", call().input)).toBeUndefined();
  });

  it("never blocks a look, a page it has not seen, or an outcome that said to try again later", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.recorded(call({ effect: "observe", proposes: false, effectApplied: false, refused: false }));
    expect(guard.blocks("core.run_node", call().input)).toBeUndefined();
    for (const resultCode of ["web.action.rejected.rate_limited", "web.action.rejected.target_disabled", "web.action.rejected.page_loading"]) {
      const later = automationStudioLlmEvidenceRepeatGuard();
      later.recorded(call({ resultCode }));
      expect(later.blocks("core.run_node", call().input), resultCode).toBeUndefined();
    }
    const unseen = automationStudioLlmEvidenceRepeatGuard();
    unseen.recorded(call({ stateBefore: undefined, stateAfter: undefined }));
    expect(unseen.blocks("core.run_node", call().input)).toBeUndefined();
  });

  it("forgets the page when something moved it unseen, and keys on the last page seen when the call reported none", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.recorded(call());
    guard.moved();
    expect(guard.blocks("core.run_node", call().input)).toBeUndefined();
    guard.seen("s1");
    expect(guard.blocks("core.run_node", call().input)).toBeDefined();
    const bare = automationStudioLlmEvidenceRepeatGuard();
    bare.seen("s9");
    bare.recorded(call({ stateBefore: undefined, stateAfter: undefined }));
    expect(bare.blocks("core.run_node", call().input)?.callId).toBe("c1");
  });

  it("counts refused repeats in a row by decision", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    expect([guard.refusedAgain(4), guard.refusedAgain(5), guard.refusedAgain(7), guard.refusedAgain(8), guard.refusedAgain(9)]).toEqual([1, 2, 1, 2, 3]);
  });
});
