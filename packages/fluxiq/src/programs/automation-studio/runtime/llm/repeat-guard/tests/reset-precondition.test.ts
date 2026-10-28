// A trial refused until the site is put back is lifted by any later call that ran, a look included (`../outcomes.ts`,
// office r2). Live run `run-mvfq94ff-c8c21493` (rows 0096-0110 and 0151-0161): a trial was refused
// `candidate.trial_reset_required` / `candidate.trial_reset_unproved`; the read that settles it is a look on the same
// page, so the page digest the refusal was keyed on never moved.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceRepeatGuard, type AutomationStudioLlmEvidenceCallOutcome } from "../outcomes.ts";

const trialInput = { revision: 2, digest: "sha256:rev2" };
const evidence = { ok: false, code: "candidate.trial_reset_required", actsToRestore: [{ act: "act-12", did: "pressed Buy Now" }], instruction: "Put the site back first." };
// The trial gates' result as the loop records it (`../../evidence-loop.ts`, `recorded`), but without the gates' own
// `retry_allowed` reason, which `../retry-later.ts` exempts on its own (last test): the precondition must hold without it.
const refusedTrial = (callId: string, code = "candidate.trial_reset_required"): AutomationStudioLlmEvidenceCallOutcome => ({
  callId, toolId: "core.test_subflow", input: trialInput, stateBefore: "cart", stateAfter: "cart", effect: "mutate", proposes: true,
  effectApplied: false, refused: true, resultCode: code, answer: JSON.stringify({ ...evidence, code })
});
const look = (callId: string, refused = false): AutomationStudioLlmEvidenceCallOutcome => ({
  callId, toolId: "core.run_node", input: { node: "web.extract_list", parameters: { undoes: "act-12", resetDestination: "destination-1" } },
  stateBefore: "cart", stateAfter: "cart", effect: "observe", proposes: false, effectApplied: false, refused,
  ...(refused ? { resultCode: "web.action.rejected.target_unobserved" } : {}), answer: refused ? "{\"ok\":false}" : "2 rows"
});

describe("a trial refused until the site is put back", () => {
  it("runs again after a look on the same page, for each reset refusal and its project form", () => {
    for (const code of ["candidate.trial_reset_required", "candidate.trial_reset_unproved", "candidate.trial_start_differs", "candidate.trial_starts_in_end_state", "project.trial_reset_required"]) {
      const guard = automationStudioLlmEvidenceRepeatGuard();
      guard.seen("cart");
      guard.recorded(refusedTrial("t1", code));
      guard.recorded(look("l1"));
      expect(guard.state(), code).toBe("cart");
      expect(guard.blocks("core.test_subflow", trialInput), code).toBeUndefined();
    }
  });

  it("is refused again when no call ran between", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.seen("cart");
    guard.recorded(refusedTrial("t1"));
    expect(guard.blocks("core.test_subflow", trialInput)).toMatchObject({ callId: "t1", outcome: "failed", resultCode: "candidate.trial_reset_required" });
  });

  it("is not lifted by a look that was itself refused", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.seen("cart");
    guard.recorded(refusedTrial("t1"));
    guard.recorded(look("l1", true));
    expect(guard.blocks("core.test_subflow", trialInput)?.callId).toBe("t1");
    // A look that ran after it still lifts it.
    guard.recorded(look("l2"));
    expect(guard.blocks("core.test_subflow", trialInput)).toBeUndefined();
  });

  it("leaves an unrelated failure on the same page refused after the look", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.seen("cart");
    const press = { node: "web.click", parameters: { target: "t7" } };
    guard.recorded({ callId: "p1", toolId: "core.run_node", input: press, stateBefore: "cart", stateAfter: "cart", effect: "mutate", proposes: true, effectApplied: false, refused: true, resultCode: "web.action.rejected.target_covered", answer: "{\"ok\":false}" });
    guard.recorded(refusedTrial("t1"));
    guard.recorded(look("l1"));
    expect(guard.blocks("core.test_subflow", trialInput)).toBeUndefined();
    expect(guard.blocks("core.run_node", press)).toMatchObject({ callId: "p1", outcome: "failed", resultCode: "web.action.rejected.target_covered" });
  });

  it("records the call that met it as any call, so an act that changed nothing stays a repeat", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.seen("cart");
    const press = { node: "web.click", parameters: { target: "t9" } };
    const unchanged = (callId: string): AutomationStudioLlmEvidenceCallOutcome => ({ callId, toolId: "core.run_node", input: press, stateBefore: "cart", stateAfter: "cart", effect: "mutate", proposes: true, effectApplied: true, refused: false });
    guard.recorded(refusedTrial("t1"));
    guard.recorded(unchanged("p1"));
    expect(guard.blocks("core.test_subflow", trialInput)).toBeUndefined();
    expect(guard.blocks("core.run_node", press)).toMatchObject({ callId: "p1", outcome: "changed_nothing" });
  });

  it("with the gates' own `retry_allowed` reason, is never stored as a failure at all", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.seen("cart");
    guard.recorded({ ...refusedTrial("t1"), resultReason: "retry_allowed" });
    expect(guard.blocks("core.test_subflow", trialInput)).toBeUndefined();
  });
});
