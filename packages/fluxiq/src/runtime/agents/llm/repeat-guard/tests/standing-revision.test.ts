// A candidate submission is keyed on the revision standing when it was
// answered, as well as on its Flow and the page (`../outcomes.ts`, t503).
//
// Lane C round 17 (`run-mv6lgqi6-4bfab2e1`): revision 4 stood when its script
// was sent again unchanged at 0043, and Core refused it as unchanged
// (submit-flow-5). Revision 5 was then accepted. At 0051, on the same page,
// the model sent revision 4's script once more. Revision 4 had never been
// refuted, so Core would have taken it back as a new revision; the guard
// refused it unrun as a repeat of submit-flow-5, three times, and the build
// ended.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceRepeatGuard, type AutomationStudioLlmEvidenceRepeatGuard } from "../outcomes.ts";

const PAGE = "page.after-trial";
const SCRIPT_4 = "flow: Every item\nstep rows: read the list\n  node: demo.read_list";
const SCRIPT_5 = `${SCRIPT_4}\n  where: marked is present`;
const DIGEST_4 = "4".repeat(64);
const DIGEST_5 = "5".repeat(64);

function accepted(guard: AutomationStudioLlmEvidenceRepeatGuard, callId: string, flow: string, revision: number, digest: string): void {
  guard.recorded({
    callId, toolId: "core.submit_candidate", input: { summary: "a summary", flow }, effect: "observe", proposes: true, effectApplied: false, refused: false,
    answer: JSON.stringify({ ok: true, status: "draft", revision, digest, changedPaths: [], script: flow, scriptIs: `Revision ${revision}.` })
  });
}

function refusedUnchanged(guard: AutomationStudioLlmEvidenceRepeatGuard, callId: string, flow: string): void {
  guard.recorded({
    callId, toolId: "core.submit_candidate", input: { summary: "another summary", flow }, effect: "observe", proposes: true, effectApplied: false, refused: true,
    resultCode: "candidate.unchanged_submission", answer: JSON.stringify({ ok: false, code: "candidate.unchanged_submission" })
  });
}

/** Revision 4 accepted, sent again unchanged and refused, then revision 5 accepted: all on one page. */
function roundSeventeen(): AutomationStudioLlmEvidenceRepeatGuard {
  const guard = automationStudioLlmEvidenceRepeatGuard();
  guard.seen(PAGE);
  accepted(guard, "submit-flow-4", SCRIPT_4, 4, DIGEST_4);
  refusedUnchanged(guard, "submit-flow-5", SCRIPT_4);
  return guard;
}

describe("a candidate submission's repeat key and the standing revision", () => {
  it("refuses an identical resend while the revision it was refused against still stands, as before", () => {
    const guard = roundSeventeen();
    expect(guard.blocks("core.submit_candidate", { flow: SCRIPT_4 })).toMatchObject({ callId: "submit-flow-5", outcome: "failed", resultCode: "candidate.unchanged_submission" });
  });

  it("runs an earlier revision's script sent again once another revision stands: a restore, not a repeat", () => {
    const guard = roundSeventeen();
    accepted(guard, "submit-flow-6", SCRIPT_5, 5, DIGEST_5);
    expect(guard.blocks("core.submit_candidate", { summary: "Fix the field", flow: SCRIPT_4 })).toBeUndefined();
  });

  it("still answers an identical resend of the standing revision unrun, as accepted", () => {
    const guard = roundSeventeen();
    accepted(guard, "submit-flow-6", SCRIPT_5, 5, DIGEST_5);
    expect(guard.blocks("core.submit_candidate", { flow: SCRIPT_5 })).toMatchObject({ callId: "submit-flow-6" });
  });

  it("refuses the restore's own identical resend once it was refused against the new standing revision", () => {
    const guard = roundSeventeen();
    accepted(guard, "submit-flow-6", SCRIPT_5, 5, DIGEST_5);
    refusedUnchanged(guard, "submit-flow-7", SCRIPT_4);
    expect(guard.blocks("core.submit_candidate", { flow: SCRIPT_4 })?.callId).toBe("submit-flow-7");
  });

  it("leaves a refused submission's key where it was: a refusal makes no revision stand", () => {
    const guard = roundSeventeen();
    guard.recorded({ callId: "submit-flow-6", toolId: "core.submit_candidate", input: { flow: SCRIPT_5 }, effect: "observe", proposes: true, effectApplied: false, refused: true, resultCode: "flow_bootstrap.evidence_completion_parameters_unresolved", answer: JSON.stringify({ ok: false, diagnostics: { issues: [{ code: "x", line: 3 }] } }) });
    expect(guard.blocks("core.submit_candidate", { flow: SCRIPT_4 })?.callId).toBe("submit-flow-5");
  });

  it("keys no other tool on the standing revision", () => {
    const guard = roundSeventeen();
    guard.recorded({ callId: "c1", toolId: "core.run_node", input: { node: "web.click" }, effect: "mutate", proposes: false, effectApplied: false, refused: true, resultCode: "web.action.rejected.target_covered" });
    accepted(guard, "submit-flow-6", SCRIPT_5, 5, DIGEST_5);
    expect(guard.blocks("core.run_node", { node: "web.click" })?.callId).toBe("c1");
  });
});
