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
    ["web.action.rate_limited", "the page asked to wait and try again"],
    ["bootstrap.invalid_parameter_value", "the step wasn't accepted"],
    ["llm_evidence_loop.rejected.repeat_without_progress", "it made no progress"],
    ["core.replay.changed", "it didn't work the same way again"],
    ["core.replay.unreproducible", "it didn't work the same way again"],
    ["core.replay.reset_failed", "it didn't work the same way again"]
  ])("says %s as %s", (code, why) => {
    expect(activityActionFailureReason(code)).toBe(why);
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

// t193 1002-M (`run-murzln6g-11debe1d`, C12): a press refused because the call
// left out `consequences` read "Didn't work: it wasn't on the page": the
// reason `missing_input_keys` matched the page word `missing`. Nothing was
// looked for on the page; the call itself was wrong.
describe("activityActionFailureReason: a call refused for what it was written with (C12)", () => {
  it.each([
    ["missing_input_keys", "the request left out something it needs"],
    ["unexpected_input_keys", "the request had something it doesn't take"],
    ["not_a_number", "a value in the request was the wrong kind"],
    ["value_not_text", "a value in the request was the wrong kind"]
  ])("says the reason %s as %s, never in page words", (reason, why) => {
    expect(activityActionFailureReason("web.action.rejected.invalid_input", reason)).toBe(why);
    expect(activityActionFailureReason("web.action.rejected.invalid_input", reason)).not.toMatch(/page/u);
  });
});
