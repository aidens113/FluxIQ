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
    // t751 R1: an act whose control's start was never read (the settlement's `no_baseline`) names its condition too.
    expect(AUTOMATION_STUDIO_SITE_RESET_FAILED).toContain("no_baseline");
    expect(WORDS.condition("no_baseline", "no_call")).toContain("never read before this build acted");
  });
});

// t772 R2 (rerun round 6 `run-mvrj7qg9-b6dc94f6`, cause 2): one answer never says both that another call can meet its
// act's condition and that no call can settle that act.
describe("a refusal whose own act a call can still meet", () => {
  const unsettleable = (act: string) => ({ act, did: `press "Reserve" button (${act})`, reason: "gate_unsatisfiable", failed: "no_admissible_undo" });

  it("never lists its own act under actsUnsettleable, and lists it to undo instead", () => {
    for (const canMeet of ["this_page", "another_page"] as const) {
      const answer = automationStudioSiteResetRefusal("candidate.undo_unproved", { act: "act-2", failed: "undeclared_press", canMeet, instruction: "Declare it.", actsToUndo: [{ act: "act-3", did: "x" }], actsUnsettleable: [unsettleable("act-2"), unsettleable("act-9")] });
      expect(answer.actsUnsettleable.map((entry) => entry.act)).toEqual(["act-9"]);
      expect(answer.actsToUndo.map((entry) => entry.act)).toEqual(["act-3", "act-2"]);
    }
    const alone = automationStudioSiteResetRefusal("candidate.undo_unproved", { act: "act-2", failed: "undeclared_press", canMeet: "this_page", instruction: "Declare it.", actsToUndo: [], actsUnsettleable: [unsettleable("act-2")] });
    expect(alone).not.toHaveProperty("actsUnsettleable");
    expect(alone.actsToUndo).toEqual([{ act: "act-2", did: `press "Reserve" button (act-2)` }]);
  });

  it("keeps it listed apart where no call can meet the refusal's condition", () => {
    const answer = automationStudioSiteResetRefusal("candidate.undo_already_done", { act: "act-2", failed: "undo_spent", canMeet: "no_call", instruction: "x", actsToUndo: [], actsUnsettleable: [unsettleable("act-2")] });
    expect(answer.actsUnsettleable.map((entry) => entry.act)).toEqual(["act-2"]);
  });
});
