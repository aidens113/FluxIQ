// A no's reasons, and whether an answer asked again may take its place (t686,
// `../no-reasons.ts`): every reason a no states must be the kind its recheck
// addresses or refuted by Core's record, or the no stands. A library catalogue
// and a concert listing: no task, site, item or answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import { automationStudioResultNoRecord } from "../../refuted-no/index.ts";
import { MISSING_LIST_NO } from "../../refuted-no/tests/library-readings-fixture.ts";
import { libraryRequestText, libraryRunSummary, libraryWording } from "../../refuted-no/tests/library-fixture.ts";
import { automationStudioResultNoReasonsSettled } from "../no-reasons.ts";

/** A recheck that addresses only what blames the "Format" filter. */
const formatOnly = { addressed: (reason: string) => /\bformat filter\b/iu.test(reason) && /\b(?:narrow\w*|drop\w*|remov\w*)\b/iu.test(reason) };

const libraryRecord = () => {
  const summary = libraryRunSummary();
  return automationStudioResultNoRecord({ summary, requestText: libraryRequestText(), wording: libraryWording(summary) });
};

describe("a no's reasons (t686)", () => {
  it("is settled where every reason it states is the kind the recheck addresses, and lists them", () => {
    const reading = { observed: "Read kept 9 rows. The Format filter narrowed the list before the read.", advice: "Remove the Format filter so the read runs over every result." };
    expect(automationStudioResultNoReasonsSettled(reading, formatOnly)).toEqual({
      settled: true,
      addressed: ["The Format filter narrowed the list before the read.", "Remove the Format filter so the read runs over every result."]
    });
  });

  it("stands where any other reason is left: a row kept that the request leaves out, in its own sentence or its own clause", () => {
    const sentence = { observed: "The Format filter narrowed the list. The stored rows include \"Rivers Boxed Set\", which the end view marks Promoted.", advice: "Remove the Format filter." };
    expect(automationStudioResultNoReasonsSettled(sentence, formatOnly).settled).toBe(false);
    const clause = { observed: "The Format filter narrowed the list, but promoted rows were not left out by any condition." };
    expect(automationStudioResultNoReasonsSettled(clause, formatOnly).settled).toBe(false);
  });

  it("reads a part calling something harmless, redundant, correct or matching the request as no reason", () => {
    for (const observed of [
      "The rating filter keeps rows the request excludes, and condition 2 then drops them, so the filter is redundant but not harmful.",
      "Condition 1 left out \"Rivers Bookmark\" -- a bookmark, not a book, so that exclusion is correct.",
      "Condition 1 correctly dropped the two bookmarks.",
      "The Language filter and the Binding filter match the request."
    ]) expect(automationStudioResultNoReasonsSettled({ observed }, formatOnly)).toEqual({ settled: true, addressed: [] });
    // Negated, the same words state a reason.
    expect(automationStudioResultNoReasonsSettled({ observed: "The Language filter does not match the request." }, formatOnly).settled).toBe(false);
    expect(automationStudioResultNoReasonsSettled({ observed: "Condition 1 is not correct for \"Rivers Bookmark\"." }, formatOnly).settled).toBe(false);
  });

  it("takes advice resting on settled reasons with them, and advice naming something they never name as a reason of its own", () => {
    const observed = "The Format filter narrowed the list before the read.";
    expect(automationStudioResultNoReasonsSettled({ observed, advice: "Let the read's own conditions keep the request's books." }, formatOnly).settled).toBe(true);
    expect(automationStudioResultNoReasonsSettled({ observed, advice: "Keep condition 2 as it is." }, formatOnly).settled).toBe(true);
    expect(automationStudioResultNoReasonsSettled({ observed, advice: "Add a condition leaving out rows marked 'Promoted'." }, formatOnly).settled).toBe(false);
  });

  it("settles a reason Core's record refutes, reading each sentence without Core's own condition wording", () => {
    // Its rows named missing are settled by the request's words; "Condition 2 (...) left them out" names nothing beyond Core's wording.
    expect(automationStudioResultNoReasonsSettled({ observed: MISSING_LIST_NO.observed, advice: MISSING_LIST_NO.changed }, { addressed: () => false, record: libraryRecord() }).settled).toBe(true);
    // Without the record, nothing refutes them, and the no stands.
    expect(automationStudioResultNoReasonsSettled({ observed: MISSING_LIST_NO.observed, advice: MISSING_LIST_NO.changed }, { addressed: () => false }).settled).toBe(false);
  });

  it("lets a reason naming nothing rest on the others only where Core's record refutes the whole reading, never on a recheck's kind", () => {
    const refuted = { observed: `Stored only 3 rows. ${MISSING_LIST_NO.observed}`, advice: MISSING_LIST_NO.changed };
    expect(automationStudioResultNoReasonsSettled(refuted, { addressed: () => false, record: libraryRecord() }).settled).toBe(true);
    const beside = { observed: "The Format filter narrowed the list. Rows rated below the bound were wrongly stored too." };
    expect(automationStudioResultNoReasonsSettled(beside, formatOnly).settled).toBe(false);
  });

  it("reads a part naming a row as a reason even in neutral words, and a bare count as none", () => {
    expect(automationStudioResultNoReasonsSettled({ observed: "The Format filter narrowed the list. The stored rows include Rivers Boxed Set, marked Promoted." }, formatOnly).settled).toBe(false);
    expect(automationStudioResultNoReasonsSettled({ observed: "Read kept 9 rows across 2 pages. The Format filter narrowed the list." }, formatOnly).settled).toBe(true);
  });
});
