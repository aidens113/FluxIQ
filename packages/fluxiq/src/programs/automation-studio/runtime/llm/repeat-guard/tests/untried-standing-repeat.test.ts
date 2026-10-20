// An unchanged submission sent again is told what comes next, never to send
// the same again (`../candidate-feedback.ts`, `../unchanged-standing.ts`, t738).
//
// Office rerun round 2 (`run-mvgf04kw-310fc169`, brief-4 0128-0137): the
// refusal said revision 1 stood untested and to test it; the identical script
// sent again was told to "submit the whole subflow again", twice more, and the
// brief ended without its one test.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioLlmEvidenceRepeatGuard, automationStudioLlmEvidenceRepeatRefusalNote, automationStudioLlmEvidenceUnchangedStanding } from "../index.ts";

const DIGEST = "c".repeat(64);
const SUBFLOW = { flow: "part save_recipe: save the recipe\n  step: press save\n    node: web.dom.click\n    target: t7\n    consequences: create_item\nend" };
const CANDIDATE = { summary: "Save each recipe", flow: "flow: Save recipes\nstep save: press save\n  node: web.dom.click" };

/** An unchanged refusal as a builder's loop answers it, with or without the standing revision's last trial. */
function unchanged(code: string, extra: JsonObject = {}): string {
  return JSON.stringify({ ok: false, revision: 1, diagnostics: { ok: false, code, unchanged: true, revision: 1, digest: DIGEST, ...extra, instruction: "Revision 1 still stands." }, issueCodes: [code] });
}

function repeated(toolId: string, input: JsonObject, answer: string, code = "candidate.unchanged_submission") {
  const guard = automationStudioLlmEvidenceRepeatGuard();
  guard.seen("page.recipes");
  guard.recorded({ callId: "submit2", toolId, input, effect: "observe", proposes: true, effectApplied: false, refused: true, resultCode: code, answer });
  const earlier = guard.blocks(toolId, input)!;
  return { earlier, note: automationStudioLlmEvidenceRepeatRefusalNote({ toolId, earlier, inARow: 1, candidate: true }) };
}

describe("the standing revision an unchanged refusal named", () => {
  it("is read from the refusal's diagnostics, with whether it was tried", () => {
    expect(automationStudioLlmEvidenceUnchangedStanding("candidate.unchanged_submission", unchanged("candidate.unchanged_submission"))).toEqual({ revision: 1, digest: DIGEST });
    expect(automationStudioLlmEvidenceUnchangedStanding("candidate.unchanged_submission", unchanged("candidate.unchanged_submission", { lastTrial: { verdict: "no", feedback: {} } }))).toEqual({ revision: 1, digest: DIGEST, tried: true });
    const otherStanding = JSON.stringify({ ok: false, diagnostics: { code: "candidate.unchanged_after_no", judged: {}, standingRevision: { revision: 3, digest: DIGEST, verdict: "unsure" } } });
    expect(automationStudioLlmEvidenceUnchangedStanding("candidate.unchanged_after_no", otherStanding)).toEqual({ revision: 3, digest: DIGEST, tried: true });
  });

  it("is nothing for another refusal, or an answer in plain words", () => {
    expect(automationStudioLlmEvidenceUnchangedStanding("flow_bootstrap.completion_refused", unchanged("candidate.unchanged_submission"))).toBeUndefined();
    expect(automationStudioLlmEvidenceUnchangedStanding("candidate.unchanged_submission", "not json")).toBeUndefined();
    expect(automationStudioLlmEvidenceUnchangedStanding(undefined, undefined)).toBeUndefined();
  });
});

describe("a builder's unchanged submission sent again", () => {
  it("names core.test_subflow with the untried revision and digest as the next call, and never says to submit again", () => {
    const { earlier, note } = repeated("core.submit_subflow", SUBFLOW, unchanged("candidate.unchanged_submission"));
    expect(earlier.standing).toEqual({ revision: 1, digest: DIGEST });
    const instruction = String(note.instruction);
    expect(instruction).toContain(`Your next call is core.test_subflow with exactly {"revision": 1, "digest": "${DIGEST}"}`);
    expect(instruction).toContain("submit2");
    expect(instruction).not.toContain("submit the whole subflow again");
    expect(instruction).not.toMatch(/submit[^.]*again/u);
    expect(note).not.toHaveProperty("issues");
  });

  it("says to change what a tried revision's feedback names, testing it again only where that feedback allows", () => {
    const { note } = repeated("core.submit_subflow", SUBFLOW, unchanged("candidate.unchanged_submission", { lastTrial: { verdict: "execution_failed", feedback: {} } }));
    const instruction = String(note.instruction);
    expect(instruction).toContain("Change the step that feedback names");
    expect(instruction).toContain("send that changed subflow with core.submit_subflow");
    expect(instruction).toContain(`revision 1 again with core.test_subflow, using exactly {"revision": 1, "digest": "${DIGEST}"}, only if that feedback says trying again may pass`);
    expect(instruction).not.toContain("submit the whole subflow again");
  });

  it("after a judge's no names no test of the refuted script, and never says to submit it again", () => {
    const refuted = JSON.stringify({ ok: false, diagnostics: { ok: false, code: "candidate.unchanged_after_no", unchanged: true, judged: { said: "no" } }, issueCodes: ["candidate.unchanged_after_no"] });
    const { note } = repeated("core.submit_subflow", SUBFLOW, refuted, "candidate.unchanged_after_no");
    const instruction = String(note.instruction);
    expect(instruction).toContain("under judged");
    expect(instruction).not.toContain("Your next call is");
    expect(instruction).not.toContain("submit the whole subflow again");
  });
});

describe("a candidate's unchanged submission sent again", () => {
  it("names core.test_candidate with the untried revision and digest, not a change to the step", () => {
    const { note } = repeated("core.submit_candidate", CANDIDATE, unchanged("candidate.unchanged_submission"));
    const instruction = String(note.instruction);
    expect(instruction).toContain(`Your next call is core.test_candidate with exactly {"revision": 1, "digest": "${DIGEST}"}`);
    expect(instruction).not.toContain("Change the step");
    expect(instruction).not.toMatch(/submit[^.]*again/u);
  });
});
