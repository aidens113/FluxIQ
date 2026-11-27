import { describe, expect, it } from "vitest";
import { automationStudioRecordConditionHolds, automationStudioRecordConditionPattern, readAutomationStudioRecordConditionPattern } from "../../index.ts";

// Patterns from run `run-mwyg0x66-4d561a42` (t1070), written as a model writes PCRE.
const LEADING_FLAG = "(?i)^(new listing)?kestrel 35\\b";
const ANCHOR_THEN_FLAG = "^(?i)Kestrel 35(?![-\\w ]*(S\\b|Mk|Mark|0))";

describe("readAutomationStudioRecordConditionPattern", () => {
  it("reads a leading (?i), (?m) or (?s) as the JavaScript flag of the same letter, after a leading ^ too", () => {
    const leading = readAutomationStudioRecordConditionPattern(LEADING_FLAG);
    expect(leading.ok && leading.pattern.flags).toBe("i");
    expect(leading.ok && leading.pattern.source).toBe("^(new listing)?kestrel 35\\b");
    expect(automationStudioRecordConditionHolds({ field: "title", matches: LEADING_FLAG }, "New listingKestrel 35 rangefinder")).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: "title", matches: ANCHOR_THEN_FLAG }, "kestrel 35 with case")).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: "title", matches: ANCHOR_THEN_FLAG }, "Kestrel 35S")).toBe(false);
    const delimited = readAutomationStudioRecordConditionPattern("/(?is)a.b/");
    expect(delimited.ok && delimited.pattern.flags).toBe("is");
    expect(readAutomationStudioRecordConditionPattern("/(?i)abc/i").ok).toBe(true);
    expect(automationStudioRecordConditionPattern("(?m)^b")?.flags).toBe("im");
  });

  it("refuses an inline group JavaScript has no flag for, and one further in, saying why", () => {
    expect(readAutomationStudioRecordConditionPattern("(?x)a b")).toEqual({ ok: false, reason: expect.stringContaining("only (?i), (?m) and (?s) have a JavaScript flag; x has none") });
    const inner = readAutomationStudioRecordConditionPattern("spare(?i)strap");
    expect(inner.ok).toBe(false);
    if (inner.ok) return;
    expect(inner.reason).toMatch(/^not a valid JavaScript regular expression \(Invalid group\)\./u);
    expect(inner.reason).toContain("JavaScript reads no inline flag group inside a pattern");
    // The pattern itself is never quoted back.
    expect(inner.reason).not.toContain("strap");
  });

  it("says what is wrong with any other pattern, quoting only the parser's reason", () => {
    expect(readAutomationStudioRecordConditionPattern("")).toEqual({ ok: false, reason: "empty" });
    const unclosed = readAutomationStudioRecordConditionPattern("(unclosed");
    expect(unclosed).toEqual({ ok: false, reason: expect.stringMatching(/^not a valid JavaScript regular expression \(Unterminated group\)\.$/u) });
    expect(readAutomationStudioRecordConditionPattern("/a/q")).toEqual({ ok: false, reason: expect.stringContaining("names the flag q") });
    const long = readAutomationStudioRecordConditionPattern(`(${"word|".repeat(45)}end)`);
    expect(long).toEqual({ ok: false, reason: expect.stringMatching(/^230 characters, over the 200 a pattern may have\. Write a list of shorter patterns/u) });
  });

  it("keeps accepting and refusing every other pattern as before", () => {
    expect(automationStudioRecordConditionPattern("^spare\\b")?.flags).toBe("i");
    expect(automationStudioRecordConditionPattern("/^spare/")?.flags).toBe("");
    expect(automationStudioRecordConditionPattern("/Case/gi")?.flags).toBe("i");
    expect(automationStudioRecordConditionPattern("(unclosed")).toBeUndefined();
    expect(automationStudioRecordConditionPattern("x".repeat(201))).toBeUndefined();
  });
});
