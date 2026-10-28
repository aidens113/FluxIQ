import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_TRIAL_OFFLINE_FIRST_WORDS as WORDS } from "../index.ts";

// t769 P6: the plain sentences a model reads about an offline-first test.
// Generic words only (trace plan D36, "model guidance never teaches to the
// test"): never an id, a trace, or a realistic site's or task's words.

/** The matcher's gap reasons, spelled as plain strings: this module never imports the trace code. */
const GAP_REASONS = ["missing_transition", "argument_mismatch", "ambiguous_context", "missing_artifact", "incomplete_capture", "incompatible_contract", "redacted_input", "snapshot_unavailable", "dynamic_content"];

/** The realistic scenarios' sites and the words of their tasks, which no model guidance may echo. */
const REALISTIC = ["everything-store", "crossborder", "bigbox", "job board", "job-board", "classified", "auction", "photo", "social", "company", "professional", "cart", "friend", "listing", "product", "marketplace", "retail"];

const sentences = (): string[] => [WORDS.kept, WORDS.passed, WORDS.inconclusive, WORDS.notTried, WORDS.otherReason, ...Object.values(WORDS.reasons), ...GAP_REASONS.map((why) => WORDS.gap(3, why)), WORDS.gap(12, "unknown_reason")];

describe("AUTOMATION_STUDIO_TRIAL_OFFLINE_FIRST_WORDS", () => {
  it("says a kept answer ran against the recording of this build's last live test, not the site", () => {
    expect(WORDS.kept.startsWith("This test ran against the recording of this build's last live test, not the site.")).toBe(true);
  });

  it("says every live note ran on the site", () => {
    for (const said of [WORDS.passed, WORDS.inconclusive, WORDS.notTried, WORDS.gap(2, "argument_mismatch")]) expect(said).toMatch(/ran on the site/u);
  });

  it("words every matcher gap reason, keyed by its plain code", () => {
    for (const why of GAP_REASONS) {
      expect(typeof WORDS.reasons[why]).toBe("string");
      expect(WORDS.reasons[why]!.length).toBeGreaterThan(10);
    }
  });

  it("says changed action or order, a page that changed by itself, and no saved page copy in plain words", () => {
    expect(WORDS.reasons.argument_mismatch).toMatch(/action changed/u);
    expect(WORDS.reasons.ambiguous_context).toMatch(/order/u);
    expect(WORDS.reasons.dynamic_content).toMatch(/page changed by itself/u);
    expect(WORDS.reasons.snapshot_unavailable).toMatch(/no saved copy of the page/u);
  });

  it("names the gap's step and its reason in words, never the reason code", () => {
    for (const why of GAP_REASONS) {
      const said = WORDS.gap(7, why);
      expect(said).toContain("step 7");
      expect(said).toContain(WORDS.reasons[why]);
      expect(said).not.toContain(why);
    }
  });

  it("words an unknown reason generically, never echoing it", () => {
    const said = WORDS.gap(4, "some_new_reason");
    expect(said).toContain(WORDS.otherReason);
    expect(said).not.toContain("some_new_reason");
    expect(WORDS.gap(4, "toString")).toContain(WORDS.otherReason);
  });

  it("never says trace, an id, a digit beyond the step, or a realistic site's or task's words", () => {
    for (const said of sentences()) {
      expect(said.toLowerCase()).not.toMatch(/trace|\bid\b|revision \d|digest|run id/u);
      expect(said.replace(/step \d+/u, "")).not.toMatch(/\d/u);
      for (const word of REALISTIC) expect(said.toLowerCase()).not.toContain(word);
    }
  });

  it("is frozen", () => {
    expect(Object.isFrozen(WORDS)).toBe(true);
    expect(Object.isFrozen(WORDS.reasons)).toBe(true);
  });
});
