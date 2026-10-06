// What the model is told when a call is refused as a repeat (`../feedback.ts`).
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceRepeatRefusalNote } from "../feedback.ts";

describe("the note for a refused repeat", () => {
  it("says a handle was never shown, and which call shows or mints it, when that was the only failure", () => {
    const note = automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_node", inARow: 1, earlier: { callId: "read-page3", outcome: "failed", resultCode: "web.action.rejected.target_unobserved", resultReason: "handle_not_in_packet", handleUnshown: true } });
    expect(note).toMatchObject({ code: "llm_evidence_loop.repeat_refused", sameAsCall: "read-page3", then: { outcome: "failed", resultReason: "handle_not_in_packet", handleUnshown: true } });
    expect(String(note.instruction)).toMatch(/never shown/u);
    expect(String(note.instruction)).toMatch(/detect/u);
    expect(String(note.instruction)).toMatch(/look at the page/u);
  });

  it("keeps the plain repeat note for any other failure", () => {
    const note = automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_node", inARow: 1, earlier: { callId: "c1", outcome: "failed", resultCode: "web.action.rejected.target_covered" } });
    expect(note.then).toEqual({ outcome: "failed", resultCode: "web.action.rejected.target_covered" });
    expect(String(note.instruction)).not.toMatch(/never shown/u);
  });

  it("tells a part run refused on an unchanged draft to change the draft first (run-musr9pv3-f4bf6256)", () => {
    const note = automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_flow", inARow: 2, earlier: { callId: "c1", outcome: "same_draft", resultCode: "core.run_flow.ran" } });
    expect(note.then).toEqual({ outcome: "same_draft", resultCode: "core.run_flow.ran" });
    expect(String(note.instruction)).toMatch(/unchanged draft/u);
    expect(String(note.instruction)).toMatch(/change the draft first \(amend_draft/u);
    expect(String(note.instruction)).not.toMatch(/never shown/u);
  });
});
