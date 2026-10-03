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
    // A press the page itself turned down in words beside the control -- "Please select a Color." --
    // or answered as busy or too fast, is not a permission refusal (t174 F40, run-muqk4u32).
    ["web.action.refused_by_page", "the page turned it down"],
    ["llm_evidence_loop.rejected.refused_by_page", "the page turned it down"],
    // t174-w85 D8 (run-murwd8le, 0081): a press the page answered as busy read "the page turned it down".
    ["web.action.rate_limited", "the page was busy"],
    ["web.action.throttled", "the page was busy"],
    ["bootstrap.invalid_parameter_value", "the step wasn't accepted"],
    ["llm_evidence_loop.rejected.repeat_without_progress", "it made no progress"],
    ["core.replay.changed", "it didn't work the same way again"],
    ["core.replay.unreproducible", "it didn't work the same way again"],
    ["core.replay.reset_failed", "it didn't work the same way again"]
  ])("says %s as %s", (code, why) => {
    expect(activityActionFailureReason(code)).toBe(why);
  });

  // t174-w85 D8 (run-murwd8le, step 0020): the build's "Get coupons" press came back
  // `web.action.rejected.refused_by_page` with the reason `page_busy_try_later`, and
  // its card read "Didn't work: the page turned it down" beside a page that was busy.
  it("says a press the page refused as busy as the page being busy, not as turned down", () => {
    expect(activityActionFailureReason("web.action.rejected.refused_by_page", "page_busy_try_later")).toBe("the page was busy");
    expect(activityActionFailureReason("web.action.rejected.refused_by_page", "busy")).toBe("the page was busy");
    expect(activityActionFailureReason("web.action.rejected.refused_by_page", "please_select_a_color")).toBe("the page turned it down");
  });

  it("says nothing for a code that names no reason, and never the code", () => {
    expect(activityActionFailureReason("web.action.failed")).toBeNull();
    expect(activityActionFailureReason("core.replay.replayed")).toBeNull();
    // A step the site remembered, was checked, or was already in place held (t193).
    for (const held of ["core.replay.remembered", "core.replay.verified", "core.replay.present"]) expect(activityActionFailureReason(held)).toBeNull();
    expect(activityActionFailureReason("example.unrecognised_state")).toBeNull();
    expect(activityActionFailureReason("not_found")).toBe("it wasn't on the page");
  });
});

describe("activityActionFailureReason: a refusal's own reason (t193)", () => {
  it.each([
    ["target_not_a_handle", "it didn't name a control from the page"],
    ["malformed_handle", "it didn't name a control from the page"],
    ["handle_in_wrong_parameter", "it didn't name a control from the page"],
    ["handle_no_longer_on_page", "it was no longer on the page"],
    ["covered_by_layer", "a popup or banner on the page was covering it"],
    ["nothing_changed_while_waiting", "nothing on the page changed"],
    ["page_unchanged_after_action", "nothing on the page changed"]
  ])("says the reason %s as %s, whatever the code", (reason, why) => {
    expect(activityActionFailureReason("web.action.rejected.target_unobserved", reason)).toBe(why);
  });

  it("falls back to the code when the reason names nothing it knows, and never says the reason", () => {
    expect(activityActionFailureReason("web.action.rejected.target_unobserved", "vendor_specific_thing")).toBe("it wasn't on the page");
    expect(activityActionFailureReason("web.action.failed", "vendor_specific_thing")).toBeNull();
  });
});
