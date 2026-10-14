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

  it("says a call the permission gate refused cannot get past it by being sent again (t471)", () => {
    const note = automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_node", inARow: 1, earlier: { callId: "undo-2", outcome: "failed", resultCode: "web.action.rejected.permission_required", resultReason: "consequences_declined" } });
    expect(note.then).toEqual({ outcome: "failed", resultCode: "web.action.rejected.permission_required", resultReason: "consequences_declined" });
    expect(String(note.instruction)).toMatch(/needs a person's permission/u);
    expect(String(note.instruction)).toMatch(/Do not make this call again/u);
    expect(String(note.instruction)).not.toMatch(/use a different control or a different input/u);
  });

  it("tells a part run refused on an unchanged draft to change the draft first (run-musr9pv3-f4bf6256)", () => {
    const note = automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_flow", inARow: 2, earlier: { callId: "c1", outcome: "same_draft", resultCode: "core.run_flow.ran" } });
    expect(note.then).toEqual({ outcome: "same_draft", resultCode: "core.run_flow.ran" });
    expect(String(note.instruction)).toMatch(/unchanged draft/u);
    expect(String(note.instruction)).toMatch(/change the draft first \(amend_draft/u);
    expect(String(note.instruction)).not.toMatch(/never shown/u);
  });

  // t591 (from t587's note): a loop that drafts nothing -- a project's supervisor, a reset -- has no draft to amend,
  // and nothing is tested or judged when its round ends.
  const EARLIER = [
    { callId: "c1", outcome: "failed", resultCode: "web.action.rejected.target_covered" },
    { callId: "c2", outcome: "failed", resultCode: "web.action.rejected.permission_required", resultReason: "consequences_declined" },
    { callId: "c3", outcome: "same_answer" },
    { callId: "c4", outcome: "failed", resultReason: "handle_not_in_packet", handleUnshown: true }
  ] as const;

  it("tells a loop that drafts nothing that its work ends with nothing tested or judged, and offers no draft to amend (t591)", () => {
    for (const earlier of EARLIER) {
      const said = String(automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_node", inARow: 1, earlier, undrafted: true }).instruction);
      expect(said, earlier.callId).toContain("end this work where it stands, with nothing tested or judged.");
      expect(said, earlier.callId).not.toMatch(/Flow so far|tested and judged|amend the draft/u);
    }
  });

  it("words a drafting loop's note as before, and a candidate's byte for byte whatever the flag (t591)", () => {
    for (const earlier of EARLIER) {
      const drafting = String(automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_node", inARow: 1, earlier }).instruction);
      expect(drafting).toContain("end this round, and the Flow so far is then tested and judged.");
      expect(automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_node", inARow: 1, earlier, undrafted: false })).toEqual(automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_node", inARow: 1, earlier }));
      const candidate = automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_node", inARow: 1, earlier, candidate: true });
      expect(automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_node", inARow: 1, earlier, candidate: true, undrafted: true })).toEqual(candidate);
    }
  });
});
