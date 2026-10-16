// A8 frozen pair 8 candidate towels `run-mvam0lys-2d3eb090` (t665): trial 0042
// stored exactly the rows asked for, and judge call 0043's no stood, so the
// exact revision was banned. Its reading, 1,100 characters, was weighed clipped
// to 500; one sentence blamed a rating step Core measured as removing no row
// (16 results before it, 16 after) but also named a condition, so it stood;
// and a sentence calling two stored rows left out had a trailing clause naming
// no row, and a value of the judge's own reason ("4.5+") after a label spelled
// whole. The same shape on a library catalogue: read whole (A), the step blamed
// clause by clause (B), and the left-out claim held to the clauses naming a row
// (C), the no is refuted whole and so asked once more. And (A) a reading whose
// true reason runs past the old 500-character cut is weighed on that reason.
// Kept here, `../../refuted-no/tests/` being full. No task, site, item or answer
// of any realistic scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { automationStudioResultVerificationAgreement } from "../../agreement/index.ts";
import type { AutomationStudioResultNarrowingStep, AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultNoRecord, automationStudioResultRefutedReading } from "../../refuted-no/index.ts";
import { automationStudioResultVerdict } from "../../verdict.ts";
import { automationStudioRequestWording } from "../index.ts";
// Imported last: imported first, the harness barrel loads the verdict's evidence screen half-built (an import cycle).
import { parseAutomationStudioLlmProviderResult } from "../../../llm/harness/index.ts";

const BODY = "List every mystery novel the library lends itself (not partner libraries) that is available to borrow today at my branch and rated 4.5 or higher, going through every page. Leave out featured listings, list each title once, in relevance order, with columns title, author and rating.";
const PREFIX = "node.bootstrap.5d1a9e.find_mysteries";
const READ = `${PREFIX}.s13`;
const RATING_STEP = `${PREFIX}.s10`;

/** Stored, and a featured copy of each left out by condition 1 alone. */
const HARBOR = "Harbor Lights at Midnight, Hardcover";
const BELLS = "Silent Bells of Ashford, Large Print";
const STORED = [
  { title: HARBOR, author: "M. Ostrander", rating: "4.6" },
  { title: BELLS, author: "C. Varga", rating: "4.9" },
  { title: "The Glass Orchard Murders, Paperback", author: "E. Lindqvist", rating: "4.7" },
  { title: "Wrenfield Abbey Casebook, Hardcover", author: "T. Holm", rating: "4.5" }
];
/** Left out by the availability condition alone: Core read "Available tomorrow" on each. */
const FOG = "Fog Over Penhallow Quay, Hardcover";
const LEDGER = "The Ninth Ledger Mystery, Paperback";
/** Left out by the rating bound alone, rated 4.3 and 4.4. */
const DUNMORE = "Quiet Streets of Dunmore, Paperback";
const LARKSPUR = "Echoes in Larkspur Lane, Hardcover";

const AVAILABLE_TODAY = "availability (read \"Available to borrow today\" on a row it kept) contains [\"Available to borrow today\"]";

/** The steps before the read, as step 0043's summary carries them: the rating step's count unchanged unless `rating` says otherwise. */
function narrowed(rating: { before: number; after: number }): AutomationStudioResultNarrowingStep[] {
  return [
    { nodeId: `${PREFIX}.s8`, label: "Choose this library", control: "This library (23)", effect: "same_page", group: "Lender", chose: "This library", leftOptions: [{ words: "Partner libraries", count: 9 }], resultCount: { before: 32, after: 23 }, addedChoice: true },
    { nodeId: `${PREFIX}.s9`, label: "Choose available today", control: "Today (16)", effect: "same_page", group: "Availability", chose: "Today", leftOptions: [{ words: "This week", count: 7 }], resultCount: { before: 23, after: 16 }, addedChoice: true },
    { nodeId: RATING_STEP, label: "Choose 4 & up", control: "4 & up (16)", effect: "same_page", group: "Rating", chose: "4 & up", leftOptions: [{ words: "3 & up", count: 16 }], resultCount: rating, addedChoice: true }
  ];
}

function summary(rating = { before: 16, after: 16 }): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: STORED.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "mysteries", recordCount: STORED.length, refusedCount: 0, truncated: false, columns: ["title", "author", "rating"], columnsWithheld: false,
      rowsChecked: STORED.length, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: STORED.map((row) => ({ ...row })),
      processing: { collected: 4, duplicates: 0, filteredOut: 0, cut: 0, kept: 4, passes: [{ node: READ, pass: 1, rows: 3, newRows: 3 }, { node: READ, pass: 2, rows: 1, newRows: 1 }] }
    }],
    reads: [{
      nodeId: READ, definitionId: "extract_list", pagesRead: 2, stop: "ended", truncated: false, itemsSeen: 10, kept: 4, paginates: true,
      conditions: [
        {
          number: 1, condition: "featured is absent", rejected: 2, alone: 2, leftOutOnlyByThis: [HARBOR, BELLS], leftOutSettled: [HARBOR, BELLS],
          leftOutObservations: [
            { source: "read", page: 1, item: 1, readKind: "text", state: "present", value: "Featured" },
            { source: "read", page: 1, item: 2, readKind: "text", state: "present", value: "Featured" }
          ]
        },
        {
          number: 2, condition: AVAILABLE_TODAY, rejected: 2, alone: 2, leftOutOnlyByThis: [FOG, LEDGER], leftOutSettled: [FOG, LEDGER],
          leftOutObservations: [
            { source: "read", page: 1, item: 6, readKind: "text", state: "present", value: "Available tomorrow" },
            { source: "read", page: 2, item: 2, readKind: "text", state: "present", value: "Available tomorrow" }
          ]
        },
        { number: 3, condition: "rating atLeast 4.5", rejected: 2, alone: 2, leftOutOnlyByThis: [`${DUNMORE} — rating: 4.3`, `${LARKSPUR} — rating: 4.4`], leftOutSettled: [`${DUNMORE} — rating: 4.3`, `${LARKSPUR} — rating: 4.4`] }
      ],
      narrowedBefore: narrowed(rating)
    }],
    flowShape: [
      { nodeId: `${PREFIX}.s2`, definitionId: "type_text" }, { nodeId: `${PREFIX}.s8`, definitionId: "click" }, { nodeId: `${PREFIX}.s9`, definitionId: "click" },
      { nodeId: RATING_STEP, definitionId: "click" }, { nodeId: READ, definitionId: "extract_list" }
    ],
    withheld: false
  };
}

const INSTRUCTION: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: BODY,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};
const REQUEST_TEXT = `Goal\n${BODY}`;
const record = (judged = summary()) => automationStudioResultNoRecord({ summary: judged, requestText: REQUEST_TEXT, wording: automationStudioRequestWording([INSTRUCTION], judged) });

const EXPECTED = "Every mystery novel the library lends itself, available to borrow today at my branch, rated 4.5+, from every page, without featured listings, each title once, in relevance order, with title, author, rating.";
/** Step 0043's `observed`, sentence for sentence. */
const OBSERVED_0043 = [
  "Read kept 4 rows over 2 pages (16 results after the site's filters).",
  `But the '4 & up' rating filter (${RATING_STEP}) keeps 4.0-4.4 titles the request excludes, and the read's condition 3 (rating atLeast 4.5) correctly drops them; conversely the site filter's count (16) is not the request's cohort.`,
  `More importantly, condition 1 (featured is absent) left out '${HARBOR}' and '${BELLS}' — both are library-lent, available-today, 4.5+ mysteries that the request asks for; the request only says to leave out featured listings, and these rows are the title itself, not a featured listing.`,
  `Also condition 2 (availability contains 'Available to borrow today') left out '${FOG}' and '${LEDGER}' which show 'Available tomorrow', correctly excluded.`,
  `Condition 3 left out '${DUNMORE}' (4.3) and '${LARKSPUR}' (4.4), correctly excluded.`
].join(" ");
const CHANGED_0043 = `Condition 1 (featured is absent) on ${READ} is too broad: it drops rows whose label is the requested title but which carry a 'Featured' badge. The condition should be narrowed to exclude only rows that are featured placements, or the read should keep rows whose title matches the requested novel regardless of a featured badge. Also verify condition 2's availability value: 'Available to borrow today' is correct per request.`;

/** A judge's reply as the provider returns it, through Core's reading of it. */
function parsed(diagnosis: Record<string, unknown>) {
  const result = parseAutomationStudioLlmProviderResult({ response: { kind: "diagnosis", summary: "Judged.", diagnosis } }, "diagnosis");
  return result.response?.kind === "diagnosis" ? result.response.diagnosis : undefined;
}

const STEP_FINDING = "Step \"Choose 4 & up\" chose \"4 & up\" in \"Rating\": the page stated 16 results before it and 16 after, so it removed no row; no row the request asks for can be missing because of it.";

describe("step 0043's no over the exact answer (t665)", () => {
  it("is read whole, past the 500 characters it used to be cut at", () => {
    expect(OBSERVED_0043.length).toBeGreaterThan(1000);
    expect(parsed({ answersRequest: "no", expected: EXPECTED, observed: OBSERVED_0043, changed: CHANGED_0043 })?.observed).toBe(OBSERVED_0043);
  });

  it("is refuted whole: the step blamed removed no row, both titles called left out are stored, the rest Core settled", () => {
    const diagnosis = parsed({ answersRequest: "no", expected: EXPECTED, observed: OBSERVED_0043, changed: CHANGED_0043 });
    const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed: diagnosis?.observed ?? "", advice: diagnosis?.changed ?? "" }, record());
    expect(weighed.wholly).toBe(true);
    const said = weighed.findings.join(" ");
    expect(said).toContain(STEP_FINDING);
    expect(said).toContain(`"${HARBOR}" is in the stored rows: another copy of it was kept.`);
    expect(said).toContain(`"${BELLS}" is in the stored rows: another copy of it was kept.`);
    expect(said).toContain(`Core's read saw "${FOG}"`);
  });

  it("as both calls of a double no, is marked refuted whole, to be asked once more", () => {
    const judged = summary();
    const wording = automationStudioRequestWording([INSTRUCTION], judged);
    const no = (): AutomationStudioResultVerification => automationStudioResultVerdict({ summary: judged, wording, diagnosis: { answersRequest: "no", expected: EXPECTED, observed: OBSERVED_0043, changed: CHANGED_0043 }, basis: "model" });
    const outcome = automationStudioResultVerificationAgreement({ first: no(), second: no(), confirmAnswer: true, reads: judged.reads, recordSets: judged.recordSets, wording, summary: judged, requestText: REQUEST_TEXT });
    expect(outcome.weighedNos).toEqual([{ call: 1, recordContradicts: "whole" }, { call: 2, recordContradicts: "whole" }]);
  });

  it("stands where the rating step's count changed, 23 results before it and 16 after", () => {
    expect(automationStudioResultRefutedReading({ expected: EXPECTED, observed: OBSERVED_0043, advice: CHANGED_0043 }, record(summary({ before: 23, after: 16 }))).wholly).toBe(false);
  });
});

describe("a reading whose true reason runs past the old 500-character cut (t665, step 0063)", () => {
  /** Under 480 characters of claims Core refutes, then a stored row called the wrong kind of thing. */
  const HEAD = `Condition 2 (availability contains 'Available to borrow today') alone left out ${FOG} (Available tomorrow) and ${LEDGER} (Available tomorrow) — the request asks for titles available to borrow today, so these are correctly excluded. Condition 3 alone left out ${DUNMORE} (4.3) and ${LARKSPUR} (4.4) — the request asks for 4.5 or higher, so these are correctly excluded.`;
  const TAIL = ` However, the read kept a title that is no novel: "Wrenfield Abbey Casebook, Hardcover" (a puzzle casebook, not a mystery novel) is in the stored rows, and the request asks only for mystery novels.`;
  const OBSERVED = `${HEAD}${" Every page was read.".repeat(4)}${TAIL}`;

  it("is weighed on the whole of it, and that reason stands", () => {
    expect(HEAD.length).toBeLessThan(480);
    expect(OBSERVED.indexOf(TAIL.trim())).toBeGreaterThan(500);
    const diagnosis = parsed({ answersRequest: "no", expected: EXPECTED, observed: OBSERVED });
    expect(diagnosis?.observed).toBe(OBSERVED);
    const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed: diagnosis?.observed ?? "" }, record());
    expect(weighed.wholly).toBe(false);
    expect(weighed.findings.join(" ")).toContain(`Core's read saw "${FOG}"`);
    // Its first 500 characters alone hold only refuted claims: cut there, Core labelled text it never read.
    expect(automationStudioResultRefutedReading({ expected: EXPECTED, observed: `${OBSERVED.slice(0, 489)}… [clipped]` }, record()).wholly).toBe(true);
  });

  it("as both calls of a double no, is marked contradicted in part, never whole", () => {
    const judged = summary();
    const wording = automationStudioRequestWording([INSTRUCTION], judged);
    const reply = parsed({ answersRequest: "no", expected: EXPECTED, observed: OBSERVED, changed: "Add a condition keeping only mystery novels." })!;
    const no = (): AutomationStudioResultVerification => automationStudioResultVerdict({ summary: judged, wording, diagnosis: reply, basis: "model" });
    const outcome = automationStudioResultVerificationAgreement({ first: no(), second: no(), confirmAnswer: true, reads: judged.reads, recordSets: judged.recordSets, wording, summary: judged, requestText: REQUEST_TEXT });
    expect(outcome.weighedNos).toEqual([{ call: 1, recordContradicts: "part" }, { call: 2, recordContradicts: "part" }]);
  });
});
