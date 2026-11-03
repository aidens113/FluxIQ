// A no is asked again over steps before the read only where such steps are
// every reason it gives (t686, `../narrowing.ts`, `../narrowing-no-reask.ts`
// over `../../agreement/no-reasons.ts`). A replay of A8 cost round
// `run-mvblov2i-abb7d82e` judges 0043-0046, paraphrased onto a concert
// listing: one no blamed the filters before the read; the other called one
// "redundant but not harmful", said two left-out non-concerts were "correctly
// excluded" (one named after the host), and said promoted rows were stored.
// Both were asked again with a recheck about steps only and two yeses passed a
// wrong Flow. Now the second no stands, so the double no stands. No task,
// site, item or answer of any realistic scenario.
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioResultReadAccount, AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultVerificationAgreement } from "../../agreement/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultNarrowingNoBlamed, automationStudioResultReaskNarrowingNo } from "../index.ts";

const id = (step: string) => `node.flow.find_concerts.${step}`;

const read: AutomationStudioResultReadAccount = {
  nodeId: id("s9"), definitionId: "extract_list", pagesRead: 2, stop: "control_absent", truncated: false, kept: 10,
  conditions: [
    { condition: "title contains [\"Jazz\"]", rejected: 2, alone: 2, leftOutOnlyByThis: ["Harbor Jazz Poster", "Cityscene Jazz Club Gift Card"] },
    { condition: "rating atLeast 4.5", rejected: 3, alone: 3, leftOutOnlyByThis: ["Dusk Combo Matinee — rating: 4.3", "Ferry Swing Night — rating: 4.2", "Old Mill Sessions — rating: 4.4"] }
  ],
  narrowedBefore: [
    { nodeId: id("s3"), label: "choose the Cityscene host filter", effect: "same_page", group: "Host", chose: "Cityscene", addedChoice: true, resultCount: { before: 40, after: 28 } },
    { nodeId: id("s4"), label: "choose the Seats booking filter", effect: "same_page", group: "Booking", chose: "Seats", leftOptions: [{ words: "Standing", count: 9 }], addedChoice: true, resultCount: { before: 28, after: 22 } },
    { nodeId: id("s5"), label: "choose the Tonight date filter", effect: "same_page", group: "Date", chose: "Tonight", leftOptions: [{ words: "Tomorrow", count: 6 }], addedChoice: true, resultCount: { before: 22, after: 17 } },
    { nodeId: id("s6"), label: "choose the 4 & up rating filter", effect: "same_page", group: "Rating", chose: "4 & up", addedChoice: true, resultCount: { before: 17, after: 17 } }
  ]
};

const summary: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 10, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 0, recordSets: [],
  reads: [read],
  flowShape: ["s3", "s4", "s5", "s6"].map((step) => ({ nodeId: id(step), definitionId: "click" })).concat([{ nodeId: id("s9"), definitionId: "extract_list" }]),
  withheld: false
};

const REQUEST = "On Cityscene, list every jazz concert that Cityscene hosts itself rather than a partner venue, with seats bookable for tonight, and rated 4.5 stars or higher. Leave out promoted listings and list each concert once, with columns title, price and rating.";
const wording = automationStudioRequestWording([{ title: "Goal", body: REQUEST }], summary);
const says = wording?.says;

const verdict = (answersRequest: "yes" | "no", diagnosis: { expected?: string; observed?: string; changed?: string }): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary, diagnosis: { answersRequest, ...diagnosis }, basis: "model" });

/** 0043's shape: the filters before the read blamed, one of them wrongly, and a left-out row rightly so. */
const STEPS_NO = verdict("no", {
  observed: "Read kept 10 rows but the site's own filters narrowed before the read: s3 chose Host Cityscene (40→28), s4 Seats (28→22), s5 Tonight (22→17), s6 '4 & up' (17→17). "
    + "The read's condition 2 (rating atLeast 4.5) is the request's bound, but the site's '4 & up' filter is coarser and the read ran on the filtered 17-result set, so concerts rated 4.5+ that the site's filter dropped never reached the read. "
    + "Also the read's condition 1 (title contains \"Jazz\") left out 'Harbor Jazz Poster' — a poster, not a concert, so that exclusion is correct.",
  changed: `The read node ${id("s9")} is correct on rating (atLeast 4.5) and title; the problem is the pre-read narrowing steps s3–s6, which apply the site's own coarser filters instead of letting the read's conditions decide. `
    + "Remove or replace s6 ('4 & up') so the read's rating atLeast 4.5 condition is the sole rating gate, and keep s3/s4/s5 only if their words match the request exactly (Cityscene host, Seats, Tonight)."
});

/** 0044's shape: a filter called harmless, rows rightly left out (one named after the host), and promoted rows stored -- the true reason. */
const PROMOTED_NO = verdict("no", {
  observed: "Read kept 10 rows but the site's own filters were applied first: the '4 & up' Rating filter (s6) keeps 4.0-4.4 rows the request excludes, and the read's condition 2 (rating atLeast 4.5) then drops them, so the filter is redundant but not harmful; "
    + "however the read's condition 1 (title contains \"Jazz\") left out 'Harbor Jazz Poster' and 'Cityscene Jazz Club Gift Card' — not concerts, so correctly excluded. "
    + "The 'Tonight' date filter (s5) and 'Seats' filter (s4) match the request. "
    + "Promoted rows (Bluebird, Lantern duplicate) were not excluded by any condition, yet the stored rows include 'Bluebird Quartet Live' and 'Lantern Trio Evening', which the endView shows marked 'Promoted'.",
  changed: `Add a condition to the read ${id("s9")} excluding rows whose listing is marked 'Promoted' (the request says 'leave out promoted listings'); the current where has only title contains "Jazz" and rating atLeast 4.5, so promoted rows such as Bluebird Quartet Live and Lantern Trio Evening were stored.`
});

/** 0045/0046's shape: the re-asked calls said yes. */
const YES = verdict("yes", { observed: "10 rows, each a jazz concert Cityscene hosts, bookable tonight, rated 4.5 or higher." });

async function replay(first: AutomationStudioResultVerification, second: AutomationStudioResultVerification) {
  const input = { first, second, confirmAnswer: true, reads: [read], requestText: REQUEST, wording };
  const settled = automationStudioResultVerificationAgreement(input);
  const ask = vi.fn(async (_recheck: string, _call: 1 | 2) => YES);
  const outcome = await automationStudioResultReaskNarrowingNo({ settled, first, second, reads: [read], requestText: REQUEST, says, ask, agree: (one, two) => automationStudioResultVerificationAgreement({ ...input, first: one, second: two }) });
  return { settled, outcome, ask };
}

describe("the replay of two judge replies over a wrong Flow (t686)", () => {
  it("keeps the double no: the no saying promoted rows were stored is not asked again, so neither is", async () => {
    const { settled, outcome, ask } = await replay(STEPS_NO, PROMOTED_NO);
    expect(settled).toMatchObject({ verdict: "does_not_answer", verdicts: ["does_not_answer", "does_not_answer"] });
    expect(ask).not.toHaveBeenCalled();
    expect(outcome).toBe(settled);
  });

  it("does not read the harmless filter, the rightly left-out rows or the matching filters as blaming a step, and weighs the promoted rows", () => {
    expect(automationStudioResultNarrowingNoBlamed(PROMOTED_NO.repair?.judgement, [read], REQUEST, says)).toBeUndefined();
    // Without its promoted-rows reason the no blames one step only, which removed no row.
    const harmless = { ...PROMOTED_NO.repair!.judgement!, observed: PROMOTED_NO.repair!.judgement!.observed!.replace(/ Promoted rows[^]*$/u, ""), advice: "Remove s6." };
    expect(automationStudioResultNarrowingNoBlamed(harmless, [read], REQUEST, says)).toBeUndefined();
  });

  it("still answers the no blaming only the filters, naming the steps by their short node ids, without vouching for options that split one part of the request", async () => {
    const words = automationStudioResultNarrowingNoBlamed(STEPS_NO.repair?.judgement, [read], REQUEST, says) ?? "";
    expect(words).toContain("\"choose the Cityscene host filter\" chose \"Cityscene\" in \"Host\", and the request itself says \"Cityscene\".");
    expect(words).toContain("\"choose the 4 & up rating filter\" chose \"4 & up\" in \"Rating\", and only added that choice: the page stated 17 results before it and 17 after, so it removed no row.");
    expect(words).not.toContain("the request itself says \"Seats\"");
    expect(words).not.toContain("the request itself says \"Tonight\"");
    expect(words).toContain("\"choose the Seats booking filter\" chose \"Seats\" in \"Booking\". The options it left unchosen: \"Standing\" (9). The page stated 28 results before it and 22 after. Its option is one word of the request's \"seats bookable for tonight\", as is \"Tonight\" in \"Date\" in another group: a site filter's option words do not show that each kept row meets that part of the request; a row's own text does.");
    const { outcome, ask } = await replay(STEPS_NO, YES);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0]![0]).toContain("A site filter's option words do not show that each kept row meets the words of the request; a row's own text does.");
    expect(outcome).toMatchObject({ verdict: "answers", calls: 3 });
  });

  it("does not read a row named after a step's option as naming that step", () => {
    const rowOnly = { observed: "Condition 1 dropped 'Cityscene Jazz Club Gift Card', a gift card the request does not ask for.", advice: "Nothing about the steps." };
    expect(automationStudioResultNarrowingNoBlamed(rowOnly, [read], REQUEST, says)).toBeUndefined();
  });
});
