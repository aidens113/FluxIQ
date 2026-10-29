import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_SITE_RESET_CAN_MEET, AUTOMATION_STUDIO_SITE_RESET_FAILED, AUTOMATION_STUDIO_SITE_RESET_LISTED_APART, automationStudioSiteResetAnswerAgreeing, automationStudioSiteResetConditionWords, automationStudioSiteResetRefusal, type AutomationStudioSiteResetFailed } from "../index.ts";

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

// t772 R2 (rerun round 6 `run-mvrj7qg9-b6dc94f6`, cause 2), t797 P4 item 3: one answer never says both that another call
// can meet its act's condition and that no call can settle that act. The ledger's verdict is the one answer: where it lists
// the refusal's own act apart, the refusal says no call can meet it, and never lists that act to undo.
describe("a refusal whose own act the ledger lists apart", () => {
  const unsettleable = (act: string) => ({ act, did: `press "Reserve" button (${act})`, reason: "gate_unsatisfiable", failed: "no_admissible_undo" });

  it("says no call can meet it, in the condition's own words, and keeps the act listed apart, never to undo", () => {
    for (const canMeet of ["this_page", "another_page"] as const) {
      const answer = automationStudioSiteResetRefusal("candidate.undo_unproved", { act: "act-2", failed: "undeclared_press", canMeet, instruction: "Declare it.", actsToUndo: [{ act: "act-3", did: "x" }, { act: "act-2", did: "y" }], actsUnsettleable: [unsettleable("act-2"), unsettleable("act-9")] });
      expect(answer.canMeet).toBe("no_call");
      expect(answer.condition).toBe(automationStudioSiteResetConditionWords("undeclared_press", "no_call"));
      expect(answer.instruction).toBe(AUTOMATION_STUDIO_SITE_RESET_LISTED_APART);
      expect(answer.actsUnsettleable.map((entry) => entry.act)).toEqual(["act-2", "act-9"]);
      expect(answer.actsToUndo.map((entry) => entry.act)).toEqual(["act-3"]);
    }
  });

  it("agrees with the ledger on an answer the ledger listed acts apart beside after building it", () => {
    const built = automationStudioSiteResetRefusal("candidate.undo_already_back", { act: "act-2", failed: "already_back", canMeet: "this_page", instruction: "Look.", actsToUndo: [] });
    const listed = automationStudioSiteResetAnswerAgreeing({ ...built, actsUnsettleable: [unsettleable("act-2")] });
    expect(listed).toMatchObject({ canMeet: "no_call", condition: automationStudioSiteResetConditionWords("already_back", "no_call"), instruction: AUTOMATION_STUDIO_SITE_RESET_LISTED_APART, actsToUndo: [], actsUnsettleable: [{ act: "act-2" }] });
  });

  it("leaves an answer alone where its own act is not listed apart, or no call can meet it already", () => {
    const meetable = automationStudioSiteResetRefusal("candidate.undo_unproved", { act: "act-2", failed: "undeclared_press", canMeet: "this_page", instruction: "Declare it.", actsToUndo: [{ act: "act-2", did: "y" }], actsUnsettleable: [unsettleable("act-9")] });
    expect(meetable).toMatchObject({ canMeet: "this_page", instruction: "Declare it.", actsToUndo: [{ act: "act-2" }], actsUnsettleable: [{ act: "act-9" }] });
    const closed = automationStudioSiteResetRefusal("candidate.undo_already_done", { act: "act-2", failed: "undo_spent", canMeet: "no_call", instruction: "x", actsToUndo: [], actsUnsettleable: [unsettleable("act-2")] });
    expect(closed).toMatchObject({ canMeet: "no_call", instruction: "x", actsUnsettleable: [{ act: "act-2" }] });
  });
});
