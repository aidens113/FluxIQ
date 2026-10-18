// A press refused because a layer over the page covered its control, made again on the same page, is told to close the
// layer first (`../covered-refused.ts`, `../feedback.ts`, `../candidate-feedback.ts`). Breadth run
// `run-mvcwem7d-34689f55`: a builder's covered press was sent three more times, each told only to "use a different
// control", and its brief ended.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceRepeatCoveredRefused } from "../covered-refused.ts";
import { automationStudioLlmEvidenceRepeatRefusalNote } from "../feedback.ts";
import { automationStudioLlmEvidenceRepeatGuard, type AutomationStudioLlmEvidenceCallOutcome } from "../outcomes.ts";

const COVERED = [
  { callId: "p1", outcome: "failed", resultCode: "web.action.rejected.target_covered", resultReason: "covered_by_layer" },
  { callId: "p2", outcome: "failed", resultCode: "web.action.rejected.target_covered", resultReason: "answered_the_same_again" },
  { callId: "p3", outcome: "failed", resultCode: "web.action.rejected.blocked_by_dialog" }
] as const;

describe("a covered press refused as a repeat", () => {
  it("is recognised by its code, whichever reason it carries, and nothing else is", () => {
    for (const earlier of COVERED) expect(automationStudioLlmEvidenceRepeatCoveredRefused(earlier), earlier.callId).toBe(true);
    expect(automationStudioLlmEvidenceRepeatCoveredRefused({ callId: "x", outcome: "failed", resultCode: "web.action.rejected.permission_required" })).toBe(false);
    expect(automationStudioLlmEvidenceRepeatCoveredRefused({ callId: "x", outcome: "failed", resultCode: "web.action.rejected.target_covered_elsewhere" })).toBe(false);
    expect(automationStudioLlmEvidenceRepeatCoveredRefused({ callId: "x", outcome: "changed_nothing", resultCode: "web.action.rejected.target_covered" })).toBe(false);
    expect(automationStudioLlmEvidenceRepeatCoveredRefused({ callId: "x", outcome: "failed", resultReason: "covered_by_layer" })).toBe(false);
  });

  it("tells a drafting loop to close the layer first, with the controls the earlier answer names, then press again", () => {
    for (const earlier of COVERED) {
      const note = automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_node", inARow: 1, earlier });
      expect(note).toMatchObject({ code: "llm_evidence_loop.repeat_refused", sameAsCall: earlier.callId, then: { outcome: "failed", resultCode: earlier.resultCode } });
      const said = String(note.instruction);
      expect(said, earlier.callId).toMatch(/covers its control/u);
      expect(said).toMatch(/nothing was pressed/u);
      expect(said).toMatch(/refused the same way until that layer is gone/u);
      expect(said).toMatch(/under sameAsCall, names the layer and, where it can, the controls that close it/u);
      expect(said).toMatch(/Press one of those first, or another control inside that layer -- never a control the page marks as covered by it/u);
      expect(said).toMatch(/Then this press may be made again: a call made after the page has changed is not a repeat/u);
      expect(said).toContain("Repeats refused in a row end this round, and the Flow so far is then tested and judged.");
      expect(said).not.toMatch(/use a different control or a different input/u);
    }
  });

  it("says the same to a loop that drafts nothing, ending its work untested", () => {
    const said = String(automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_node", inARow: 1, earlier: COVERED[0], undrafted: true }).instruction);
    expect(said).toMatch(/Press one of those first/u);
    expect(said).toContain("end this work where it stands, with nothing tested or judged.");
    expect(said).not.toMatch(/Flow so far|amend the draft/u);
  });

  it("says the same in candidate and builder mode, with the count that ends the build", () => {
    const first = String(automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_node", inARow: 1, earlier: COVERED[1], candidate: true }).instruction);
    expect(first).toMatch(/Press one of those first, or another control inside that layer/u);
    expect(first).toContain("Sending this press unchanged again is refused the same way, and 3 repeats refused in a row end this build with nothing tested.");
    expect(first).not.toMatch(/use a different control or a different input|submit a corrected candidate/u);
    const last = String(automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_node", inARow: 2, earlier: COVERED[1], candidate: true }).instruction);
    expect(last).toContain("Sending this press unchanged again ends this build with nothing tested.");
  });

  it("runs again once a press that closes the layer changed the page", () => {
    const press = { node: "web.click", parameters: { target: "t4" } };
    const refused: AutomationStudioLlmEvidenceCallOutcome = {
      callId: "p1", toolId: "core.run_node", input: press, stateBefore: "layered", stateAfter: "layered", effect: "mutate", proposes: true,
      effectApplied: false, refused: true, resultCode: "web.action.rejected.target_covered", resultReason: "covered_by_layer"
    };
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.seen("layered");
    guard.recorded(refused);
    expect(guard.blocks("core.run_node", press)?.callId).toBe("p1");
    guard.recorded({
      callId: "close", toolId: "core.run_node", input: { node: "web.click", parameters: { target: "t8" } }, stateBefore: "layered", stateAfter: "clear",
      effect: "mutate", proposes: true, effectApplied: true, refused: false, resultCode: "web.action.succeeded"
    });
    expect(guard.blocks("core.run_node", press)).toBeUndefined();
  });
});
