import { describe, expect, it } from "vitest";
import { activityActionFailureReason } from "../failure-reason.ts";

describe("activityActionFailureReason", () => {
  it.each([
    ["web.target.not_found", "it wasn't on the page"],
    ["example.unobserved", "it wasn't on the page"],
    ["web.wait.timeout", "the page took too long"],
    ["web.wait.timed_out", "the page took too long"],
    ["web.target.ambiguous", "more than one thing on the page matched"],
    ["web.target.not-visible", "it was hidden on the page"],
    // A press a coupon popup covered was said "hidden" (crossborder run-muqc07fh-eeffbc86), and one a dialog stood in front of "not allowed".
    ["web.action.rejected.target_covered", "a popup or banner on the page was covering it"],
    ["web.action.rejected.blocked_by_dialog", "a dialog on the page was in front of it"],
    ["web.action.blocked_by_dialog", "a dialog on the page was in front of it"],
    ["web.field.disabled", "it couldn't be used yet"],
    ["web.target.stale", "the page changed before it could"],
    ["example.user_intervention_required", "the page wanted a person"],
    ["action.refused", "it wasn't allowed"],
    ["bootstrap.invalid_parameter_value", "the step wasn't accepted"],
    ["llm_evidence_loop.rejected.repeat_without_progress", "it made no progress"],
    ["core.replay.changed", "it didn't work the same way again"],
    ["core.replay.unreproducible", "it didn't work the same way again"]
  ])("says %s as %s", (code, why) => {
    expect(activityActionFailureReason(code)).toBe(why);
  });

  it("says nothing for a code that names no reason, and never the code", () => {
    expect(activityActionFailureReason("web.action.failed")).toBeNull();
    expect(activityActionFailureReason("core.replay.replayed")).toBeNull();
    expect(activityActionFailureReason("example.unrecognised_state")).toBeNull();
    expect(activityActionFailureReason("not_found")).toBe("it wasn't on the page");
  });
});
