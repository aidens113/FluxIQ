// A refusal that invites its own resend admits that one resend, and no other
// refusal is let through (`../resend-admission.ts`, t650).
//
// A8 frozen pair 4 (`run-mva446jf-926a3c72`, 0044-0050): a submission refused
// `candidate.kept_condition_dropped`, whose words invite the same change once
// more, was resent as invited and refused unrun as a repeat three times,
// because the refusal left the revision its key holds standing. The shape here
// is a campsite search's read, no realistic scenario's.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioLlmEvidenceRepeatGuard, type AutomationStudioLlmEvidenceRepeatGuard } from "../outcomes.ts";

const PAGE = "page.campsites";
const SCRIPT_1 = "flow: Open campsites\nstep rows: read the campsites\n  node: demo.read_list\n  where: promoted is absent";
const SCRIPT_2 = "flow: Open campsites\nstep rows: read the campsites\n  node: demo.read_list";
const DIGEST_1 = "1".repeat(64);
const KEPT = "candidate.kept_condition_dropped";

/** A refusal's answer as the loop records it: the tool's JSON, its feedback under `diagnostics`. */
function refusal(code: string, resend?: string): string {
  return JSON.stringify({ ok: false, revision: 1, diagnostics: { ok: false, code, ...(resend ? { resend } : {}), issues: [{ code, message: "Core's words", path: "{\"field\":\"promoted\"}" }] }, issueCodes: [code], next: "Send the same change again and it is accepted." });
}

function refused(guard: AutomationStudioLlmEvidenceRepeatGuard, toolId: string, callId: string, input: JsonObject, code: string, resend?: string): void {
  guard.recorded({ callId, toolId, input, effect: "observe", proposes: true, effectApplied: false, refused: true, resultCode: code, answer: refusal(code, resend) });
}

/** Revision 1 accepted on the campsite page: the revision a later submission's key holds. */
function standing(): AutomationStudioLlmEvidenceRepeatGuard {
  const guard = automationStudioLlmEvidenceRepeatGuard();
  guard.seen(PAGE);
  guard.recorded({
    callId: "submit-1", toolId: "core.submit_candidate", input: { summary: "Campsites", flow: SCRIPT_1 }, effect: "observe", proposes: true, effectApplied: false, refused: false,
    answer: JSON.stringify({ ok: true, status: "draft", revision: 1, digest: DIGEST_1, changedPaths: [], script: SCRIPT_1 })
  });
  return guard;
}

describe("a refusal that invites its own resend", () => {
  it("admits the identical submission once on the same page and revision, and refuses a second resend refused again", () => {
    const guard = standing();
    refused(guard, "core.submit_candidate", "submit-2", { summary: "Drop it", flow: SCRIPT_2 }, KEPT, "accepted_once");
    // The resend the refusal invites runs, with another summary or none.
    expect(guard.blocks("core.submit_candidate", { flow: SCRIPT_2 })).toBeUndefined();
    // Refused once more, marked or not, it is a failure like any: the invitation admitted one resend.
    refused(guard, "core.submit_candidate", "submit-3", { flow: SCRIPT_2 }, KEPT, "accepted_once");
    expect(guard.blocks("core.submit_candidate", { flow: SCRIPT_2 })).toMatchObject({ callId: "submit-3", outcome: "failed", resultCode: KEPT });
  });

  it("refuses an uninvited repeat exactly as before: an unmarked refusal, or one whose mark is not the one Core writes", () => {
    const guard = standing();
    refused(guard, "core.submit_candidate", "submit-2", { flow: SCRIPT_2 }, "candidate.loop_or_binding_refused");
    expect(guard.blocks("core.submit_candidate", { flow: SCRIPT_2 })).toMatchObject({ callId: "submit-2", outcome: "failed", resultCode: "candidate.loop_or_binding_refused" });
    refused(guard, "core.submit_candidate", "submit-3", { flow: `${SCRIPT_2}\n  where: rating at least 4` }, KEPT, "always");
    expect(guard.blocks("core.submit_candidate", { flow: `${SCRIPT_2}\n  where: rating at least 4` })?.callId).toBe("submit-3");
  });

  it("never reads the mark from the model's own input, or from an answer that is not a refusal's JSON", () => {
    const guard = standing();
    const input = { flow: SCRIPT_2, diagnostics: { resend: "accepted_once" }, resend: "accepted_once" };
    guard.recorded({ callId: "submit-2", toolId: "core.submit_candidate", input, effect: "observe", proposes: true, effectApplied: false, refused: true, resultCode: KEPT, answer: JSON.stringify({ ok: false, resend: "accepted_once", diagnostics: { code: KEPT } }) });
    expect(guard.blocks("core.submit_candidate", input)?.callId).toBe("submit-2");
    guard.recorded({ callId: "submit-3", toolId: "core.submit_candidate", input: { flow: SCRIPT_1 }, effect: "observe", proposes: true, effectApplied: false, refused: true, resultCode: KEPT, answer: "resend: accepted_once" });
    expect(guard.blocks("core.submit_candidate", { flow: SCRIPT_1 })?.callId).toBe("submit-3");
  });

  it("admits a subflow builder's invited resend once the same way, keyed on its whole input", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.seen(PAGE);
    const input = { flow: SCRIPT_2 };
    refused(guard, "core.submit_subflow", "submit-subflow-2", input, KEPT, "accepted_once");
    expect(guard.blocks("core.submit_subflow", input)).toBeUndefined();
    refused(guard, "core.submit_subflow", "submit-subflow-3", input, KEPT, "accepted_once");
    expect(guard.blocks("core.submit_subflow", input)).toMatchObject({ callId: "submit-subflow-3", outcome: "failed" });
    // Another refused subflow call is guarded as ever.
    refused(guard, "core.submit_subflow", "submit-subflow-4", { flow: SCRIPT_1 }, "subflow.when_refused");
    expect(guard.blocks("core.submit_subflow", { flow: SCRIPT_1 })?.callId).toBe("submit-subflow-4");
  });

  it("admits one resend per key: the same invited refusal on another page is that page's own", () => {
    const guard = standing();
    refused(guard, "core.submit_candidate", "submit-2", { flow: SCRIPT_2 }, KEPT, "accepted_once");
    refused(guard, "core.submit_candidate", "submit-3", { flow: SCRIPT_2 }, KEPT, "accepted_once");
    expect(guard.blocks("core.submit_candidate", { flow: SCRIPT_2 })?.callId).toBe("submit-3");
    guard.seen("page.campsites.page-2");
    refused(guard, "core.submit_candidate", "submit-4", { flow: SCRIPT_2 }, KEPT, "accepted_once");
    expect(guard.blocks("core.submit_candidate", { flow: SCRIPT_2 })).toBeUndefined();
  });
});
