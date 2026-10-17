// Whether a confirming verification's yes was first-ask confirmed (t677), as
// the pure rule reads the trail `../../verify.ts` records; the calls themselves
// are driven end to end in `../../tests/first-ask-route/tests/first-ask-confirmed.test.ts`.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultVerification } from "../../contracts/index.ts";
import { automationStudioResultFirstAskConfirmed, automationStudioResultModelSaid, type AutomationStudioResultFirstAskTrail } from "../index.ts";

const base = { schemaVersion: "automation-studio.result-verification.v1", code: "core.result.answers_request", reason: "Judged.", observation: "2 records stored." } as const;
const YES: AutomationStudioResultVerification = { ...base, verdict: "answers", basis: "model" };
const NO: AutomationStudioResultVerification = { ...base, verdict: "does_not_answer", basis: "model" };
const SILENT: AutomationStudioResultVerification = { ...base, verdict: "unsure", basis: "model_unavailable" };
const HELD_YES: AutomationStudioResultVerification = { ...base, verdict: "unsure", basis: "model_unconfirmed", exclusionEvidenceMissing: ["a line"], yesUnconfirmed: true };

const trail = (fields: Partial<AutomationStudioResultFirstAskTrail> = {}): AutomationStudioResultFirstAskTrail => ({
  confirmAnswer: true, outcome: { ...YES, verdicts: ["answers", "answers"], calls: 2 }, first: YES, second: YES, verdictChanged: false, reasks: 0, secondAsked: "converse", ...fields
});

describe("what the model said on one ask", () => {
  it("is its verdict word, a held yes still a yes, and nothing for an ask that gave no verdict", () => {
    expect(automationStudioResultModelSaid(YES)).toBe("answers");
    expect(automationStudioResultModelSaid(NO)).toBe("does_not_answer");
    expect(automationStudioResultModelSaid(HELD_YES)).toBe("answers");
    expect(automationStudioResultModelSaid(SILENT)).toBeUndefined();
  });
});

describe("a first-ask confirmed yes", () => {
  it("is a confirming verification's yes both checks reached, nothing re-asked and no verdict turned", () => {
    expect(automationStudioResultFirstAskConfirmed(trail())).toBe(true);
  });

  it("is not where a call was re-asked after the two checks, or a check's verdict changed between its asks", () => {
    expect(automationStudioResultFirstAskConfirmed(trail({ reasks: 1 }))).toBe(false);
    expect(automationStudioResultFirstAskConfirmed(trail({ verdictChanged: true }))).toBe(false);
  });

  // t691: an identical temperature-0 repeat is one opinion counted twice (A8 `run-mvbr0w7e-6a01c05b`, steps 0032-0033).
  it("is not where the second check asked the same question again rather than the converse", () => {
    expect(automationStudioResultFirstAskConfirmed(trail({ secondAsked: "same" }))).toBe(false);
  });

  it("is read as before t691 where the caller does not say what the second check asked", () => {
    expect(automationStudioResultFirstAskConfirmed(trail({ secondAsked: undefined }))).toBe(true);
  });

  it("is not on a runtime check, a single check, or an outcome or check that is no yes", () => {
    expect(automationStudioResultFirstAskConfirmed(trail({ confirmAnswer: false }))).toBe(false);
    expect(automationStudioResultFirstAskConfirmed(trail({ second: undefined }))).toBe(false);
    expect(automationStudioResultFirstAskConfirmed(trail({ outcome: { ...NO, verdicts: ["does_not_answer", "does_not_answer"] } }))).toBe(false);
    expect(automationStudioResultFirstAskConfirmed(trail({ first: NO }))).toBe(false);
    expect(automationStudioResultFirstAskConfirmed(trail({ second: HELD_YES }))).toBe(false);
  });
});
