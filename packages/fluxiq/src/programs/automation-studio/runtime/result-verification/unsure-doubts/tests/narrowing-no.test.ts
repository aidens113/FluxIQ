// A no that blames a step choosing the request's own words is asked once more
// (t666, A8 frozen pair 8 candidate towels `run-mvam0lys-2d3eb090`, 0064); its
// answer takes its place, so a yes still needs two yeses. A no blaming a step
// whose option is not the request's words, and which removed rows, is the
// judge's and is not asked again. A library catalogue: no task, site, item or
// answer of any realistic scenario.
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioResultReadAccount, AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultVerificationAgreement } from "../../agreement.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultVerdict } from "../../verdict.ts";
import { automationStudioResultNarrowingNoBlamed, automationStudioResultReaskNarrowingNo } from "../index.ts";

const read: AutomationStudioResultReadAccount = {
  nodeId: "read", definitionId: "extract_list", pagesRead: 1, stop: "control_absent", truncated: false, kept: 9,
  narrowedBefore: [
    { nodeId: "format", label: "Choose Hardcover format", control: "Hardcover (40)", effect: "same_page", group: "Format", chose: "Hardcover", leftOptions: [{ words: "Paperback", count: 12 }], addedChoice: true, resultCount: { before: 55, after: 40 } },
    { nodeId: "stars", label: "Choose four stars and up", effect: "same_page", group: "Reader rating", chose: "4 stars & up", addedChoice: true, resultCount: { before: 40, after: 40 } },
    { nodeId: "language", label: "Choose English", effect: "same_page", group: "Language", chose: "English", addedChoice: true, resultCount: { before: 40, after: 31 } }
  ]
};

const summary: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 9, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 0, recordSets: [],
  reads: [read],
  flowShape: [{ nodeId: "format", definitionId: "click" }, { nodeId: "stars", definitionId: "click" }, { nodeId: "language", definitionId: "click" }, { nodeId: "read", definitionId: "extract_list" }],
  withheld: false
};

const REQUEST = "List every hardcover book about rivers in the library catalogue rated 4.5 stars or higher, with title and author.";

const verdict = (answersRequest: "yes" | "no" | "unknown", diagnosis: { expected?: string; observed?: string; changed?: string } = {}): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary, diagnosis: { answersRequest, ...diagnosis }, basis: "model" });

/** 0064's shape: the filters before the read keep less than the request asks, so remove them. */
const NARROWED = verdict("no", {
  expected: "Every hardcover book about rivers rated 4.5 or higher.",
  observed: "The site's own filters narrowed the list before the read: the Format filter chose Hardcover and the Reader rating filter chose 4 stars & up. The Format filter can drop hardcover books the site lists under another format.",
  changed: "Remove the Format and Reader rating filter steps so the read runs over every result, and let the read's own conditions keep the request's books."
});
/** The same shape, blaming a step whose option is not the request's words and which removed rows. */
const LANGUAGE = verdict("no", { observed: "The Format filter chose Hardcover and the Language filter chose English, which narrowed the list beyond what the request asks.", changed: "Remove the Language filter step." });
/** A no naming a step without blaming it, and a row that is wrong. */
const ROW = verdict("no", { observed: "The Format filter chose Hardcover. The stored row \"Rivers of Ice, Paperback\" is a paperback." });
const YES = verdict("yes", { expected: "Every hardcover book about rivers.", observed: "9 rows, each a hardcover book about rivers." });
const DOUBT = verdict("unknown", { observed: "Whether every book was read could not be told." });

const wording = automationStudioRequestWording([{ title: "Goal", body: REQUEST }], summary);
const says = wording?.says;

/** The agreement's input and its outcome, as the verification passes them. */
function settledOf(first: AutomationStudioResultVerification, second: AutomationStudioResultVerification) {
  const input = { first, second, confirmAnswer: true, reads: [read], requestText: REQUEST, wording };
  return { input, settled: automationStudioResultVerificationAgreement(input) };
}

async function reasked(first: AutomationStudioResultVerification, second: AutomationStudioResultVerification, answer: AutomationStudioResultVerification) {
  const { input, settled } = settledOf(first, second);
  const ask = vi.fn(async (_recheck: string, _call: 1 | 2) => answer);
  const outcome = await automationStudioResultReaskNarrowingNo({ settled, first, second, reads: [read], requestText: REQUEST, says, ask, agree: (one, two) => automationStudioResultVerificationAgreement({ ...input, first: one, second: two }) });
  return { settled, outcome, ask };
}

describe("a no that blames a step choosing the request's own words (t666)", () => {
  it("is answered with Core's words on each step it blames: the request's words, or a step that removed no row", () => {
    expect(automationStudioResultNarrowingNoBlamed(NARROWED.repair?.judgement, [read], REQUEST, says)).toBe(
      "\"Choose Hardcover format\" chose \"Hardcover\" in \"Format\", and the request itself says \"Hardcover\". The options it left unchosen: \"Paperback\" (12). The page stated 55 results before it and 40 after. "
      + "\"Choose four stars and up\" chose \"4 stars & up\" in \"Reader rating\", and only added that choice: the page stated 40 results before it and 40 after, so it removed no row."
    );
  });

  it("is not where it blames a step whose option is not the request's words and which removed rows, or names a step without blaming it", () => {
    expect(automationStudioResultNarrowingNoBlamed(LANGUAGE.repair?.judgement, [read], REQUEST, says)).toBeUndefined();
    expect(automationStudioResultNarrowingNoBlamed(ROW.repair?.judgement, [read], REQUEST, says)).toBeUndefined();
    expect(automationStudioResultNarrowingNoBlamed(NARROWED.repair?.judgement, [read], "List every book about rivers in the library catalogue.", says)).toBeUndefined();
  });

  it("beside a yes, is asked once; a yes there beside the other yes is two yeses", async () => {
    const { settled, outcome, ask } = await reasked(NARROWED, YES, YES);
    expect(settled).toMatchObject({ verdict: "unsure", basis: "model_disagreed" });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0]![1]).toBe(1);
    const recheck = ask.mock.calls[0]![0];
    expect(recheck).toContain("Core's own record of that step and the request's own words: \"Choose Hardcover format\" chose \"Hardcover\" in \"Format\"");
    expect(recheck).toContain("Core did not see the rows such a step removed, so its record settles nothing about them.");
    expect(outcome).toMatchObject({ verdict: "answers", verdicts: ["does_not_answer", "answers", "answers"], calls: 3 });
  });

  it("stays unsure where the re-asked call says no again, and is never asked a second time", async () => {
    const { outcome, ask } = await reasked(NARROWED, YES, NARROWED);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ verdict: "unsure", verdicts: ["does_not_answer", "answers", "does_not_answer"], calls: 3 });
    const again = vi.fn(async () => YES);
    expect(await automationStudioResultReaskNarrowingNo({ settled: outcome, first: NARROWED, second: YES, reads: [read], requestText: REQUEST, says, ask: again, agree: () => outcome })).toBe(outcome);
    expect(again).not.toHaveBeenCalled();
  });

  it("in a double no, asks both where both blame such steps, and neither where one names anything else", async () => {
    const both = await reasked(NARROWED, NARROWED, YES);
    expect(both.ask).toHaveBeenCalledTimes(2);
    expect(both.outcome).toMatchObject({ verdict: "answers", calls: 4 });
    const one = await reasked(NARROWED, ROW, YES);
    expect(one.ask).not.toHaveBeenCalled();
    expect(one.outcome).toBe(one.settled);
  });

  it("is not asked for a step whose option is not the request's words, beside an unsure, or once the calls agreed yes", async () => {
    for (const [first, second] of [[LANGUAGE, YES], [NARROWED, DOUBT], [YES, YES]] as const) {
      const { settled, outcome, ask } = await reasked(first, second, YES);
      expect(ask).not.toHaveBeenCalled();
      expect(outcome).toBe(settled);
    }
  });

  it("is asked in words naming no site, task or product of a realistic scenario", async () => {
    const { ask } = await reasked(NARROWED, YES, YES);
    const words = ask.mock.calls[0]![0].replace(/"[^"]*"/gu, "");
    expect(words).not.toMatch(/\b(?:paper|towels?|holders?|pickup|retailer|valueridge|sponsored)\b/iu);
  });
});
