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

  it("counts a call that ended where the same call from the same page ended before as no progress (lane D run 37: one address, eight times)", () => {
    const go = call({ input: { node: "web.navigate", parameters: { url: "u" } }, stateBefore: "s1", stateAfter: "s2", effectApplied: true, refused: false, resultCode: "web.action.succeeded" });
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.recorded(go);
    guard.seen("s1");
    // The first repeat runs: nothing yet says it will end the same way.
    expect(guard.blocks("core.run_node", go.input)).toBeUndefined();
    guard.recorded({ ...go, callId: "c2" });
    guard.seen("s1");
    expect(guard.blocks("core.run_node", go.input)).toEqual({ callId: "c2", outcome: "same_result", resultCode: "web.action.succeeded" });
    // Ending somewhere new is progress, and lifts it.
    guard.recorded({ ...go, callId: "c3", stateAfter: "s3" });
    guard.seen("s1");
    expect(guard.blocks("core.run_node", go.input)).toBeUndefined();
  });

  it("checks a call against the page it would run on when that is not the last one seen (a rerun put back to its step's page)", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.recorded(call());
    guard.seen("s5");
    expect(guard.state()).toBe("s5");
    expect(guard.blocks("core.run_node", call().input)).toBeUndefined();
    expect(guard.blocks("core.run_node", call().input, "s1")?.outcome).toBe("failed");
  });

  it("blocks a look only once it answered the same twice on one page, and counts looks in a row until anything else", () => {
    const look = call({ toolId: "find", input: { query: "Voltbay" }, effect: "observe", proposes: false, effectApplied: false, refused: false, resultCode: "web.inspect.succeeded", answer: "0 matches" });
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.recorded(look);
    expect(guard.blocks("find", look.input)).toBeUndefined();
    guard.recorded({ ...look, callId: "c2" });
    expect(guard.blocks("find", look.input)).toEqual({ callId: "c2", outcome: "same_answer", resultCode: "web.inspect.succeeded" });
    expect(guard.looks().map((one) => one.callId)).toEqual(["c1", "c2"]);
    // A different answer is not the same look answered again; a look on a page not seen ends the run.
    const other = automationStudioLlmEvidenceRepeatGuard();
    other.recorded(look);
    other.recorded({ ...look, callId: "c2", answer: "1 match" });
    expect(other.blocks("find", look.input)).toBeUndefined();
    other.recorded({ ...look, callId: "c3", stateBefore: undefined, stateAfter: undefined });
    expect(other.looks()).toEqual([]);
    guard.recorded(call({ callId: "c4" }));
    expect(guard.looks()).toEqual([]);
  });

  it("lets a call that failed only on a handle not yet shown run again once a later call showed or minted handles (run-musp39u8, C-B1)", () => {
    const read = call({ callId: "read-page3", input: { node: "web.output.dom-extract_list", parameters: { extractList: { handle: "extraction.4" } } }, effect: "observe", resultCode: "web.action.rejected.target_unobserved", resultReason: "handle_not_in_packet" });
    const detect = call({ callId: "detect-page3", toolId: "web.detect_repeating_structure", input: { target: "t2134" }, effect: "observe", proposes: false, effectApplied: false, refused: false, resultCode: "web.structure.detected", resultReason: undefined, answer: "{\"extraction\":\"extraction.4\"}" });
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.recorded(read);
    // Before anything showed the handle, the same read is still refused, and says why.
    expect(guard.blocks("core.run_node", read.input)).toEqual({ callId: "read-page3", outcome: "failed", resultCode: "web.action.rejected.target_unobserved", resultReason: "handle_not_in_packet", handleUnshown: true });
    guard.recorded(detect);
    expect(guard.blocks("core.run_node", read.input)).toBeUndefined();
    // Failing again on the same unshown handle is refused again until something new is shown.
    guard.recorded({ ...read, callId: "read-again" });
    expect(guard.blocks("core.run_node", read.input)?.callId).toBe("read-again");
    for (const resultReason of ["handle_not_issued", "unknown_handle"]) {
      const family = automationStudioLlmEvidenceRepeatGuard();
      family.recorded({ ...read, resultReason });
      expect(family.blocks("core.run_node", read.input)?.handleUnshown, resultReason).toBe(true);
      family.recorded(detect);
      expect(family.blocks("core.run_node", read.input), resultReason).toBeUndefined();
    }
  });

  it("keeps refusing a handle failure when the later look was refused, answered as before, or on another page, and any other failure after a look", () => {
    const read = call({ callId: "read", input: { extractList: { handle: "extraction.4" } }, resultCode: "web.action.rejected.target_unobserved", resultReason: "handle_not_in_packet" });
    const look = call({ callId: "look", toolId: "look", input: {}, effect: "observe", proposes: false, effectApplied: false, refused: false, resultCode: "web.inspect.succeeded", resultReason: undefined, answer: "page" });
    const refusedLook = automationStudioLlmEvidenceRepeatGuard();
    refusedLook.recorded(read);
    refusedLook.recorded({ ...look, refused: true });
    expect(refusedLook.blocks("core.run_node", read.input)?.callId).toBe("read");
    const sameAnswer = automationStudioLlmEvidenceRepeatGuard();
    sameAnswer.recorded(look);
    sameAnswer.recorded(read);
    sameAnswer.recorded({ ...look, callId: "look2" });
    expect(sameAnswer.blocks("core.run_node", read.input)?.callId).toBe("read");
    const elsewhere = automationStudioLlmEvidenceRepeatGuard();
    elsewhere.recorded(read);
    elsewhere.recorded({ ...look, stateBefore: "s2", stateAfter: "s2" });
    expect(elsewhere.blocks("core.run_node", read.input, "s1")?.callId).toBe("read");
    const covered = automationStudioLlmEvidenceRepeatGuard();
    covered.recorded(call());
    covered.recorded(look);
    expect(covered.blocks("core.run_node", call().input)).toEqual({ callId: "c1", outcome: "failed", resultCode: "web.action.rejected.target_covered" });
  });

  it("keys a call that runs the draft on the draft as well, and refuses it once it ran on that draft and page and changed nothing (run-musr9pv3-f4bf6256)", () => {
    let draft = "D1";
    const guard = automationStudioLlmEvidenceRepeatGuard({ draftOf: (toolId) => (toolId === "core.run_flow" ? draft : undefined) });
    guard.seen("s1");
    // The live part run: no page states of its own, nothing lasting applied, passed.
    const part = call({ toolId: "core.run_flow", input: { from: 15, to: 16 }, stateBefore: undefined, stateAfter: undefined, effectApplied: false, refused: false, resultCode: "core.run_flow.ran" });
    expect(guard.blocks("core.run_flow", part.input)).toBeUndefined();
    guard.recorded(part);
    expect(guard.blocks("core.run_flow", part.input)).toEqual({ callId: "c1", outcome: "same_draft", resultCode: "core.run_flow.ran" });
    // Another part, another draft, another page: each is a new call.
    expect(guard.blocks("core.run_flow", { from: 16 })).toBeUndefined();
    expect(guard.blocks("core.run_flow", part.input, "s2")).toBeUndefined();
    draft = "D2";
    expect(guard.blocks("core.run_flow", part.input)).toBeUndefined();
    draft = "D1";
    expect(guard.blocks("core.run_flow", part.input)?.outcome).toBe("same_draft");
    // A part run that left something lasting is not refused, and a call that does not run the draft keys as before.
    const acted = automationStudioLlmEvidenceRepeatGuard({ draftOf: () => "D1" });
    acted.seen("s1");
    acted.recorded({ ...part, effectApplied: true });
    expect(acted.blocks("core.run_flow", part.input)).toBeUndefined();
    guard.recorded(call({ callId: "c9" }));
    draft = "D3";
    expect(guard.blocks("core.run_node", call().input)?.outcome).toBe("failed");
  });

  it("counts refused repeats in a row by decision", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    expect([guard.refusedAgain(4), guard.refusedAgain(5), guard.refusedAgain(7), guard.refusedAgain(8), guard.refusedAgain(9)]).toEqual([1, 2, 1, 2, 3]);
  });
});
