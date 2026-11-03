// A judge's `changed` advice that proposes a list of literal values the request
// never says gets a note, and keeps its own words (t785, F3). Clubs, made up.
// The values a noted advice listed are read back for the trial's mark
// suggestion (t790, run `run-mvswewhy-e4e469d4`), only where the note is: a
// library's loans, made up.
import { describe, expect, it } from "vitest";
import { automationStudioRequestRowWords, type AutomationStudioRequestWording } from "../../request-rows/index.ts";
import { agree } from "../agree.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultNotedListedValues } from "../../listed-values/index.ts";
import { listedValuesAdvice } from "../exclusion-words.ts";

/** A wording that says what the request text says, word for word. */
function wordingOf(request: string): AutomationStudioRequestWording {
  const words = automationStudioRequestRowWords(request).map((entry) => entry.word);
  const says = (text: string): boolean => {
    const run = automationStudioRequestRowWords(text).map((entry) => entry.word);
    return run.length > 0 && words.some((_, start) => run.every((word, index) => words[start + index] === word));
  };
  return { says } as unknown as AutomationStudioRequestWording;
}

const ADVICE = "Keep rows whose club is one of A Club, B Club.";

describe("advice listing values the request does not say", () => {
  it("is noted, with the advice left whole", () => {
    const noted = listedValuesAdvice(ADVICE, wordingOf("posts in clubs I belong to"));
    expect(noted.startsWith(ADVICE)).toBe(true);
    expect(noted).toContain("what the page shows today");
  });

  it("is not noted where the request says the values", () => {
    expect(listedValuesAdvice(ADVICE, wordingOf("posts in A Club or B Club"))).toBe(ADVICE);
  });

  it("is not noted without a list, or without a request to hold it to", () => {
    expect(listedValuesAdvice("Keep rows whose club is A Club.", wordingOf("posts in clubs I belong to"))).toBe("Keep rows whose club is A Club.");
    expect(listedValuesAdvice(ADVICE, undefined)).toBe(ADVICE);
  });
});

describe("the values a noted advice listed (t790)", () => {
  it("are read back where Core's note is, and are none where it is not", () => {
    // A library's loans, made up.
    const advice = "Keep only rows whose branch is one of Elm Street Branch, Harbour Branch.";
    expect(automationStudioResultNotedListedValues(listedValuesAdvice(advice, wordingOf("the books I have on loan")))).toEqual(["Elm Street Branch", "Harbour Branch"]);
    expect(automationStudioResultNotedListedValues(listedValuesAdvice(advice, wordingOf("loans from Elm Street Branch or Harbour Branch")))).toEqual([]);
    expect(automationStudioResultNotedListedValues(advice)).toEqual([]);
  });
});

describe("an agreed double no whose advice lists values the request does not say (t785)", () => {
  const summary: AutomationStudioRunResultSummary = {
    schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 2, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [], flowShape: [{ nodeId: "n1", definitionId: "extract" }], withheld: false
  };
  const no = (changed: string) => automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no", expected: "Posts in clubs the person belongs to.", observed: "A row is not from a club the person belongs to.", changed }, basis: "model" });
  const agreed = (request: string) => agree({ first: no(ADVICE), second: no(ADVICE), wording: wordingOf(request) }).repair?.judgement?.advice;

  it("carries the note and the advice whole", () => {
    const advice = agreed("posts in clubs I belong to");
    expect(advice).toContain(ADVICE);
    expect(advice).toContain("what the page shows today");
  });

  it("carries no note where the request says the values", () => {
    expect(agreed("posts in A Club or B Club")).toBe(ADVICE);
  });
});
