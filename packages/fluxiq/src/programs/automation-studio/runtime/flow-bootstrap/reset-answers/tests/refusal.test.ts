import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_SITE_RESET_CAN_MEET, AUTOMATION_STUDIO_SITE_RESET_FAILED, automationStudioSiteResetConditionWords, automationStudioSiteResetRefusal, type AutomationStudioSiteResetFailed } from "../index.ts";

/** The condition words, as `../../site-reset/words.ts` says them through `condition`. */
const WORDS = { condition: automationStudioSiteResetConditionWords };
/** The constructor with its arguments unchecked, so a test can hand it what its types refuse and see it throw. */
const unchecked = automationStudioSiteResetRefusal as (code: string, answer: { failed: string; canMeet: string; instruction: string }) => unknown;

// t743: the one constructor every site-reset refusal goes through. It requires
// a candidate code, a closed failed condition, where a call can meet it, and an
// instruction; it adds the condition in words and passes every other field on.

describe("the site-reset refusal constructor", () => {
  it("builds ok:false with code, failed, canMeet, the condition in words, and every other field unchanged", () => {
    const actsToUndo = [{ act: "act-1", did: "press \"Reserve\" button", settle: "read it again" }];
    const answer = automationStudioSiteResetRefusal("candidate.undo_unproved", { act: "act-1", failed: "subject_differs", canMeet: "another_page", instruction: "Do something else.", actsToUndo, settle: "s" });
    expect(answer).toEqual({ ok: false, code: "candidate.undo_unproved", failed: "subject_differs", canMeet: "another_page", condition: WORDS.condition("subject_differs", "another_page"), act: "act-1", instruction: "Do something else.", actsToUndo, settle: "s" });
    expect(answer.actsToUndo).toBe(actsToUndo);
  });

  it("refuses to build a refusal that cannot say what failed", () => {
    const base = { failed: "act_kept" as const, canMeet: "no_call" as const, instruction: "x" };
    expect(() => unchecked("project.other", base)).toThrow(/candidate code/u);
    expect(() => unchecked("candidate.", base)).toThrow(/candidate code/u);
    expect(() => unchecked("candidate.x", { ...base, failed: "made_up" })).toThrow(/known condition/u);
    expect(() => unchecked("candidate.x", { ...base, canMeet: "somewhere" })).toThrow(/canMeet/u);
    expect(() => automationStudioSiteResetRefusal("candidate.x", { ...base, instruction: " " })).toThrow(/instruction/u);
  });

  it("the closed sets have no duplicates", () => {
    expect(new Set(AUTOMATION_STUDIO_SITE_RESET_FAILED).size).toBe(AUTOMATION_STUDIO_SITE_RESET_FAILED.length);
    expect([...AUTOMATION_STUDIO_SITE_RESET_CAN_MEET]).toEqual(["this_page", "another_page", "no_call"]);
  });
});

describe("the condition words", () => {
  const REALISTIC = /\b(store|shop|cart|basket|checkout|address|job|save|saved|heart|photo|like|liked|post|friend|order|product|follow|feed|profile|apply)\b/iu;

  it("name every condition distinctly and generically, and say whether another call can meet it", () => {
    const said = AUTOMATION_STUDIO_SITE_RESET_FAILED.map((failed: AutomationStudioSiteResetFailed) => WORDS.condition(failed, "no_call"));
    expect(new Set(said).size).toBe(said.length);
    for (const failed of AUTOMATION_STUDIO_SITE_RESET_FAILED) {
      for (const canMeet of AUTOMATION_STUDIO_SITE_RESET_CAN_MEET) {
        const words = WORDS.condition(failed, canMeet);
        expect(words).not.toMatch(REALISTIC);
        expect(words).not.toMatch(/undefined/u);
      }
      expect(WORDS.condition(failed, "no_call")).toContain("No call can meet it: do not make this call, or a variation of it, again.");
      expect(WORDS.condition(failed, "this_page")).toContain("Another call on this page can meet it");
      expect(WORDS.condition(failed, "another_page")).toContain("No call on this control can meet it");
    }
    expect(WORDS.condition("subject_differs", "another_page")).toContain("a different item than the one the act was about");
    expect(WORDS.condition("already_back", "no_call")).toContain("already shows the state this build found it in");
  });
});
