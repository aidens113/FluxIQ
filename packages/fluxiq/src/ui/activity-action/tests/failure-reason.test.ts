import { describe, expect, it } from "vitest";
import { activityActionFailureReason } from "../failure-reason.ts";

describe("activityActionFailureReason", () => {
  it.each([
    // Looked up by what FluxIQ saved of it, and not found that way: the box stood in plain sight (R4a, moment 06).
    ["web.target.not_found", "FluxIQ couldn't find it where it was saved"],
    ["web.target.no_match", "FluxIQ couldn't find it where it was saved"],
    ["web.target.gone", "it wasn't on the page"],
    // A step that ran and whose effect did not show is not a refusal (R4a, moment 08).
    ["web.action.rejected.output_not_observed", "it ran, but the page didn't change the way it should have"],
    // Not looked for at all: the call named something FluxIQ had not seen (R2-U-6).
    ["example.unobserved", "FluxIQ didn't send it, as the step named something it hadn't seen on the page"],
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
    // Lane D (run-mv0fuual-f9e6f089, finding 1): the site's "You're going too fast" notice is
    // the site asking FluxIQ to slow down, which "the page was busy" did not say.
    ["web.action.rate_limited", "the site asked FluxIQ to slow down"],
    ["web.action.throttled", "the site asked FluxIQ to slow down"],
    ["web.action.too_many_requests", "the site asked FluxIQ to slow down"],
    ["web.page.busy", "the page was busy"],
    ["bootstrap.invalid_parameter_value", "the step wasn't accepted"],
    ["llm_evidence_loop.rejected.repeat_without_progress", "it made no progress"],
    // t174-w111 D21 (run-musq0b1m): "Didn't work: it didn't work the same way again" said the result twice and no reason.
    ["core.replay.failed", "it couldn't run when the test tried it again"],
    ["core.replay.changed", "it did nothing this time, where it did something before"],
    ["core.replay.unreproducible", "the page wasn't in the same state when the test got there"],
    ["core.replay.reset_failed", "the page couldn't be put back to where the Flow starts"],
    ["core.replay.something_new", "it didn't do the same when the test tried it again"]
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
    expect(activityActionFailureReason("not_found")).toBe("FluxIQ couldn't find it where it was saved");
  });
});

// U7, live run `run-musp39u8-9ac026ab` (moment 26): "Type · Search Brightaisle
// -- Didn't work: it didn't name a control from the page" read as the page
// failing. FluxIQ never sent the call: it named no control from the page.
// U-12 (`run-muw60j7c-bb7c9a62`, moment 14): "since it named no control from
// the page" was FluxIQ's own term; the words say what the step left out.
describe("activityActionFailureReason: a refusal's own reason (t193)", () => {
  const UNNAMED = "FluxIQ didn't send it, as the step didn't say which control on the page to use";
  it.each([
    ["target_not_a_handle", UNNAMED],
    ["malformed_handle", UNNAMED],
    ["handle_in_wrong_parameter", UNNAMED],
    ["handle_no_longer_on_page", "it was no longer on the page"],
    ["covered_by_layer", "a popup or banner on the page was covering it"],
    ["nothing_changed_while_waiting", "nothing on the page changed"],
    ["page_unchanged_after_action", "nothing on the page changed"]
  ])("says the reason %s as %s, whatever the code", (reason, why) => {
    expect(activityActionFailureReason("web.action.rejected.target_unobserved", reason)).toBe(why);
  });

  it("falls back to the code when the reason names nothing it knows, and never says the reason", () => {
    expect(activityActionFailureReason("web.action.rejected.target_unobserved", "vendor_specific_thing")).toBe("FluxIQ didn't send it, as the step named something it hadn't seen on the page");
    expect(activityActionFailureReason("web.target.not_found", "vendor_specific_thing")).toBe("FluxIQ couldn't find it where it was saved");
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

// t194 (`run-murwcmx2-a1c6edf7`, screenshot 00012, step 0036): a recall of a
// result nobody gave that name read "Didn't work: it wasn't on the page", when
// it never looked at the page. Core's own codes say what Core missed.
describe("activityActionFailureReason: Core's own codes are no page miss (t194)", () => {
  it.each([
    ["core.recall.not_found", "no earlier result goes by that name"],
    ["core.check.authorization_absent", "checking had not been turned on for this Flow"],
    ["core.repair.authorization_absent", "repair had not been allowed for this Flow"],
    ["core.result.required_values_missing", "the result was missing values the request needs"],
    ["core.result.verdict_absent", "no verdict came back"]
  ])("says %s as %s", (code, why) => {
    expect(activityActionFailureReason(code)).toBe(why);
  });

  it("never reads a Core code as a page miss, though a page's own code still is", () => {
    expect(activityActionFailureReason("core.something.missing")).toBeNull();
    expect(activityActionFailureReason("core.other.not_found")).toBeNull();
    expect(activityActionFailureReason("core.recall.not_found", "vendor_specific_thing")).toBe("no earlier result goes by that name");
    expect(activityActionFailureReason("web.target.not_found")).toBe("FluxIQ couldn't find it where it was saved");
  });

  // t174-w111 D17 (run-musq0b1m, steps 0063 and 0067): the model reused handles from an
  // older page view (`handle_not_in_packet`), and the card said "it wasn't on the page"
  // beside a 7-in-1 button in plain sight.
  it("says a handle from an older view of the page as that, not as a thing missing from the page", () => {
    expect(activityActionFailureReason("web.action.rejected.target_unobserved", "handle_not_in_packet")).toBe("FluxIQ was looking at an older view of the page");
    expect(activityActionFailureReason("web.action.rejected.target_unobserved")).not.toBe("it wasn't on the page");
  });
});

// t361: a lasting act whose failure left its effect unknown was not made
// again. Its code alone said "the page changed before it could" (page_changed)
// or nothing (action_failed), when the step may already have happened.
describe("activityActionFailureReason: an uncertain outcome says so (t361)", () => {
  it("says FluxIQ could not tell whether it took effect, whatever the code, and in a replay", () => {
    for (const code of ["web.action.rejected.page_changed", "web.action.rejected.action_failed", "web.action.rejected.action_timed_out", "core.replay.failed"]) {
      expect(activityActionFailureReason(code, "outcome_uncertain")).toBe("FluxIQ couldn't tell whether it took effect, so it didn't do it again");
    }
  });
});

// R2-U-6 (live run `run-muwansvz-a2b4a987`, moment 07, steps 0034, 0039 and
// 0046): a list read the step gave no usable list for (`malformed_handle`),
// then the same refusal given again (`answered_the_same_again`), read "Read
// list · Didn't work: it wasn't on the page" beside the list in plain sight.
// The call was never sent, and nothing was looked for on the page.
describe("activityActionFailureReason: a call never sent is no page miss (R2-U-6)", () => {
  const UNOBSERVED = "web.action.rejected.target_unobserved";

  it("says a list read that named no list as not read, and why, in a list's words", () => {
    expect(activityActionFailureReason(UNOBSERVED, "malformed_handle", "read")).toBe("FluxIQ didn't read it, as the step didn't say which list on the page to read");
    expect(activityActionFailureReason(UNOBSERVED, "malformed_handle", "click")).toBe("FluxIQ didn't send it, as the step didn't say which control on the page to use");
    expect(activityActionFailureReason(UNOBSERVED, undefined, "read")).toBe("FluxIQ didn't read it, as the step named a list it hadn't seen on the page");
  });

  it("says the same refusal given again as that, never as a page miss", () => {
    expect(activityActionFailureReason(UNOBSERVED, "answered_the_same_again", "read")).toBe("FluxIQ didn't read it, for the same reason as the time before");
    expect(activityActionFailureReason(UNOBSERVED, "answered_the_same_again")).toBe("FluxIQ didn't send it, for the same reason as the time before");
  });

  it("never reads target_unobserved or changes_nothing as a page miss", () => {
    for (const reason of [undefined, "changes_nothing", "answered_the_same_again", "vendor_specific_thing"]) {
      for (const kind of [undefined, "read", "click"] as const) expect(activityActionFailureReason(UNOBSERVED, reason, kind)).not.toMatch(/wasn't on the page/u);
    }
    expect(activityActionFailureReason(UNOBSERVED, "changes_nothing")).toBe("it was already tried exactly this way on this same page");
  });
});

// R4a (`run-mv2nlh9l-52e476da`, moment 08): a clear the site undid -- the
// quantity box put "1" back -- read "Clear field · Didn't work: the step wasn't
// accepted", as if it had been refused.
describe("a step that ran and whose effect did not show", () => {
  it("says the site set the box back for a typing step, and a list's words for a read", () => {
    expect(activityActionFailureReason("web.action.rejected.output_not_observed", undefined, "type")).toBe("it ran, but the site set the box back");
    expect(activityActionFailureReason("web.action.rejected", "output_not_observed", "type")).toBe("it ran, but the site set the box back");
    expect(activityActionFailureReason("web.validation.output_not_observed", undefined, "read")).toBe("it ran, but didn't find the rows it should have");
    expect(activityActionFailureReason("web.validation.state_mismatch", undefined, "click")).toBe("it ran, but the page didn't change the way it should have");
    for (const kind of ["type", "read", "click", undefined] as const) {
      expect(activityActionFailureReason("web.action.rejected.output_not_observed", undefined, kind)).not.toMatch(/accepted|allowed/u);
    }
  });

  it("says a control not found by what FluxIQ saved of it in a list's words for a read", () => {
    expect(activityActionFailureReason("web.target.not_found", undefined, "read")).toBe("FluxIQ couldn't find the list where it was saved");
    expect(activityActionFailureReason("web.target.not_found", undefined, "type")).toBe("FluxIQ couldn't find it where it was saved");
  });
});
