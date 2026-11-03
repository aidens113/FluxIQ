// A refusal that named a missing precondition is lifted by the call that meets it, whatever the page digest says
// (`../outcomes.ts`, t587). A8 launch 6 (`run-mv85vjqo-4c022aec`, brief-2, steps 31-43): a search refused
// `not_at_start_location` was refused three times more as a repeat after the builder navigated to the start, because
// the navigation reloaded a byte-identical page.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceRepeatGuard, type AutomationStudioLlmEvidenceCallOutcome } from "../outcomes.ts";

const search = { node: "web.type", parameters: { target: "t11", text: "towels", submit: true } };
// The domain reports no page states for a start-location refusal, so the guard keys it on the last page seen.
const refusedSearch = (callId: string): AutomationStudioLlmEvidenceCallOutcome => ({
  callId, toolId: "core.run_node", input: search, effect: "mutate", proposes: true, effectApplied: false, refused: true,
  resultCode: "web.action.rejected.not_at_start_location", resultReason: "start_location_not_reached", answer: "{\"ok\":false}"
});
const navigate = (callId: string): AutomationStudioLlmEvidenceCallOutcome => ({
  callId, toolId: "core.run_node", input: { node: "web.navigate", parameters: { url: "https://shop.test/" } },
  stateBefore: "home", stateAfter: "home", effect: "mutate", proposes: true, effectApplied: true, refused: false, resultCode: "web.action.succeeded"
});

describe("a refusal about the build's state, not the page", () => {
  it("is refused again while nothing met it, and runs once a navigation to the same page succeeded (run-mv85vjqo, 33 and 39)", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.seen("home");
    guard.recorded(refusedSearch("s31"));
    // Step 33: nothing had changed, and the identical search was rightly refused.
    expect(guard.blocks("core.run_node", search)).toMatchObject({ callId: "s31", outcome: "failed", resultReason: "start_location_not_reached" });
    // A look meets nothing.
    guard.recorded({ callId: "look", toolId: "find", input: { query: "towels" }, stateBefore: "home", stateAfter: "home", effect: "observe", proposes: false, effectApplied: false, refused: false, answer: "0 matches" });
    expect(guard.blocks("core.run_node", search)?.callId).toBe("s31");
    // Step 35: the navigation succeeded and left the page byte-identical.
    guard.recorded(navigate("n35"));
    expect(guard.blocks("core.run_node", search)).toBeUndefined();
    // It changed the build's arrival, so it is not a call that changed nothing.
    expect(guard.blocks("core.run_node", navigate("n").input)).toBeUndefined();
  });

  it("is lifted on every page, by the code alone or the reason alone, and a refused or unapplied act lifts nothing", () => {
    for (const named of [{ resultCode: "web.action.rejected.not_at_start_location", resultReason: undefined }, { resultCode: "web.action.rejected", resultReason: "start_location_not_reached" }]) {
      const guard = automationStudioLlmEvidenceRepeatGuard();
      guard.seen("blank");
      guard.recorded({ ...refusedSearch("s1"), ...named });
      guard.recorded({ ...navigate("n1"), stateBefore: "blank", stateAfter: "home" });
      expect(guard.blocks("core.run_node", search, "blank"), JSON.stringify(named)).toBeUndefined();
    }
    for (const unmet of [{ refused: true, effectApplied: false }, { refused: false, effectApplied: false }]) {
      const guard = automationStudioLlmEvidenceRepeatGuard();
      guard.seen("home");
      guard.recorded(refusedSearch("s1"));
      guard.recorded({ ...navigate("n1"), ...unmet });
      expect(guard.blocks("core.run_node", search)?.callId, JSON.stringify(unmet)).toBe("s1");
    }
  });

  it("leaves any other failure keyed on its page, as before", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard();
    guard.seen("home");
    guard.recorded({ ...refusedSearch("s1"), resultCode: "web.action.rejected.target_covered", resultReason: undefined });
    guard.recorded(navigate("n1"));
    expect(guard.blocks("core.run_node", search)).toEqual({ callId: "s1", outcome: "failed", resultCode: "web.action.rejected.target_covered" });
    // And a second identical navigation that met nothing changed nothing.
    guard.recorded(navigate("n2"));
    expect(guard.blocks("core.run_node", navigate("n").input)?.outcome).toBe("changed_nothing");
  });
});
