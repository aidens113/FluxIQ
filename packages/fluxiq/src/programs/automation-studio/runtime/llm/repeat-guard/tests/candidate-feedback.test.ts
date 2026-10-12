// What the model is told in candidate mode when a call is refused as a repeat
// (`../candidate-feedback.ts`). Lane C (`run-mv0fuotv-805294d7`, C2) resent one
// refused script three times, told each time to amend a draft candidate mode
// does not have and that the Flow so far would then be tested and judged.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceRepeatGuard } from "../outcomes.ts";
import { automationStudioLlmEvidenceRepeatRefusalNote } from "../feedback.ts";

/** A refusal as `../../../flow-bootstrap/candidate/submission-refusal.ts` gives it, its issues carrying step, line and instead. */
const ISSUES = [
  { code: "authoring.repeat.bound_inside_span", path: "plan.subflows.0.nodes.9", step: 10, line: 27, instead: "Write `repeat most: 10` under `repeat while`." },
  { code: "authoring.repeat.unbounded", path: "plan.subflows.0.nodes.9", step: 10, line: 23 }
];
const REFUSAL = { ok: false, revision: 2, diagnostics: { ok: false, refusal: "flow_bootstrap.completion_refused", issues: ISSUES }, issueCodes: ISSUES.map((issue) => issue.code), next: "Correct every listed issue." };
const SCRIPT = { flow: "flow: Read the list\nstep: open it\n  node: web.browser-navigate\n  url: https://example.test/" };

/** Words that belong to the draft loop, never said in candidate mode. */
const LEGACY = /amend_draft|amend the draft|\bdraft\b|\brerun\b|mark (?:it )?optional|tested and judged|Flow so far/iu;

function storedRefusal() {
  const guard = automationStudioLlmEvidenceRepeatGuard();
  guard.seen("s1");
  guard.recorded({ callId: "submit-2", toolId: "core.submit_candidate", input: SCRIPT, effect: "observe", proposes: true, effectApplied: false, refused: true, resultCode: "flow_bootstrap.completion_refused", answer: JSON.stringify(REFUSAL) });
  return guard.blocks("core.submit_candidate", SCRIPT)!;
}

describe("a repeat refused in candidate mode", () => {
  it("keeps a refusal's issues, as it listed them, with its outcome", () => {
    expect(storedRefusal()).toEqual({ callId: "submit-2", outcome: "failed", resultCode: "flow_bootstrap.completion_refused", issues: ISSUES });
  });

  it("answers an identical submission with the stored issues and candidate advice, and no legacy words", () => {
    const note = automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.submit_candidate", earlier: storedRefusal(), inARow: 1, candidate: true });
    expect(note).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_refused", sameAsCall: "submit-2", then: { outcome: "failed", resultCode: "flow_bootstrap.completion_refused" }, issues: ISSUES });
    const instruction = String(note.instruction);
    expect(instruction).toContain("same script");
    expect(instruction).toContain("not checked again");
    expect(instruction).toContain("Change the lines those issues name");
    expect(instruction).toContain("nothing tested");
    expect(instruction).not.toMatch(LEGACY);
  });

  it("says the next identical submission ends the build when it would", () => {
    const second = String(automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.submit_candidate", earlier: storedRefusal(), inARow: 2, candidate: true }).instruction);
    expect(second).toContain("Sending it unchanged again ends this build with nothing tested.");
    const first = String(automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.submit_candidate", earlier: storedRefusal(), inARow: 1, candidate: true }).instruction);
    expect(first).toContain("is refused the same way, and 3 repeats refused in a row end this build with nothing tested.");
  });

  it("names no draft in any other candidate-mode note: a call, a look, a handle never shown, an accepted submission", () => {
    const notes = [
      automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_node", inARow: 1, candidate: true, earlier: { callId: "c1", outcome: "failed", resultCode: "web.action.rejected.target_covered" } }),
      automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "web.find_on_page", inARow: 1, candidate: true, earlier: { callId: "c2", outcome: "same_answer" } }),
      automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.run_node", inARow: 1, candidate: true, earlier: { callId: "c3", outcome: "failed", resultReason: "handle_not_in_packet", handleUnshown: true } }),
      automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.submit_candidate", inARow: 1, candidate: true, earlier: { callId: "c4", outcome: "changed_nothing" } })
    ];
    for (const note of notes) {
      expect(String(note.instruction)).not.toMatch(LEGACY);
      expect(String(note.instruction)).toContain("nothing tested");
      expect(note).not.toHaveProperty("issues");
    }
  });

  it("leaves the legacy note as it was outside candidate mode, issues and all", () => {
    const note = automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.submit_candidate", earlier: storedRefusal(), inARow: 1 });
    expect(String(note.instruction)).toContain("amend the draft");
    expect(note).not.toHaveProperty("issues");
  });
});
