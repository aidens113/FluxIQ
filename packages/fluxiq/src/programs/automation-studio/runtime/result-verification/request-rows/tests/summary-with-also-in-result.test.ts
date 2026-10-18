// A left-out row whose item is also in the result is said so on the judge's
// copy (t624, `../summary-with-also-in-result.ts`). A8 bigbox
// `run-mv96rz6d-745e2940`: judges read the left-out second copies of stored
// items as items the Flow dropped and answered no over an exact answer.
import { describe, expect, it } from "vitest";
import { PLANTS_LEFT_OUT, PLANTS_PROMOTED_COPIES, plantsRunSummary } from "./promoted-copies-fixture.ts";
import { AUDIOBOOKS_NOT_ON_SHELF, AUDIOBOOKS_PROMOTED, audiobooksRunSummary } from "../../value-readings/tests/audiobooks-fixture.ts";
import { AutomationStudioRequestRowId } from "../row-id.ts";
import { automationStudioResultSummaryWithAlsoInResult } from "../summary-with-also-in-result.ts";
import { automationStudioResultSummaryWithRowIds } from "../summary-with-row-ids.ts";

/** The audiobooks read with its presence test's copies left unsettled, as a read that found no value to settle them on. */
function unsettledCopies(): ReturnType<typeof audiobooksRunSummary> {
  const summary = audiobooksRunSummary();
  delete summary.reads![0]!.conditions![0]!.leftOutSettled;
  return summary;
}

describe("the left-out rows whose item is also in the result", () => {
  it("are listed, as given, under the condition that left them out, with Core's sentence", () => {
    // Unsettled copies: a settled row is accounted for by its condition's own `settled` (live-lane-1 fix 4, below).
    const summary = unsettledCopies();
    const before = structuredClone(summary);
    const copy = automationStudioResultSummaryWithAlsoInResult(summary);
    const [promoted, shelf] = copy.reads![0]!.conditions!;
    expect(promoted!.leftOutAlsoInResult).toEqual(AUDIOBOOKS_PROMOTED);
    expect(promoted!.alsoInResult).toContain("another copy of the same item was kept, so that item is not missing from the result");
    // The rows stay where they were, and no other condition is marked.
    expect(promoted!.leftOutOnlyByThis).toEqual(AUDIOBOOKS_PROMOTED);
    expect(shelf).not.toHaveProperty("leftOutAlsoInResult");
    expect(copy.reads![0]!.conditions!.slice(1).every((entry) => entry.alsoInResult === undefined)).toBe(true);
    // The judge's copy only: the summary given is unchanged.
    expect(summary).toEqual(before);
  });

  it("are found by label, a row said with Core's id or its tested value included", () => {
    const summary = unsettledCopies();
    const condition = summary.reads![0]!.conditions![0]!;
    condition.leftOutOnlyByThis = [AutomationStudioRequestRowId.said(AUDIOBOOKS_PROMOTED[0]!, AUDIOBOOKS_PROMOTED[0]!), `${AUDIOBOOKS_PROMOTED[1]} — promoted: Promoted`];
    expect(automationStudioResultSummaryWithAlsoInResult(summary).reads![0]!.conditions![0]!.leftOutAlsoInResult).toEqual(condition.leftOutOnlyByThis);
  });

  it("need no id on the judge's copy, which a row a yes must still name keeps", () => {
    const copy = automationStudioResultSummaryWithRowIds(automationStudioResultSummaryWithAlsoInResult(audiobooksRunSummary()));
    const [promoted, shelf] = copy.reads![0]!.conditions!;
    expect(promoted!.leftOutOnlyByThis).toEqual(AUDIOBOOKS_PROMOTED);
    // The shelf test's rows are settled in this fixture, so none carries an id either; one unsettled row would.
    expect(shelf!.leftOutOnlyByThis).toEqual(AUDIOBOOKS_NOT_ON_SHELF.map(([title]) => title));
    const unsettled = audiobooksRunSummary(false);
    const ids = automationStudioResultSummaryWithRowIds(automationStudioResultSummaryWithAlsoInResult(unsettled)).reads![0]!.conditions!;
    expect(ids[0]!.leftOutOnlyByThis).toEqual(AUDIOBOOKS_PROMOTED);
    expect(ids[1]!.leftOutOnlyByThis!.every((row) => row.startsWith("[row "))).toBe(true);
  });

  it("never include a withheld label, and leave a summary with no such row the same object", () => {
    const summary = audiobooksRunSummary();
    summary.reads![0]!.conditions![0]!.leftOutOnlyByThis = ["(withheld)", "(withheld)"];
    summary.recordSets[0]!.sampleRows = [...(summary.recordSets[0]!.sampleRows ?? []), { title: "(withheld)" }];
    const copy = automationStudioResultSummaryWithAlsoInResult(summary);
    expect(copy).toBe(summary);
  });
});

// Live-lane-1 fix 4 (`run-mvd8ypsv-32cde667`): five rows of a presence test
// were all settled, and four of them were also listed as back in the result;
// both judges read the one left unlisted as missing. The run's shape on a plant
// nursery's catalogue (`./promoted-copies-fixture.ts`).
describe("the left-out rows Core settled", () => {
  it("are never also listed as in the result: settlement already accounts for them", () => {
    const condition = automationStudioResultSummaryWithAlsoInResult(plantsRunSummary()).reads![0]!.conditions![0]!;
    expect(condition).not.toHaveProperty("leftOutAlsoInResult");
    expect(condition).not.toHaveProperty("alsoInResult");
    expect(condition.leftOutSettled).toEqual(PLANTS_LEFT_OUT);
    expect(condition.leftOutOnlyByThis).toEqual(PLANTS_LEFT_OUT);
  });

  it("leave the unsettled copies listed, with a sentence saying a row not listed is accounted for by the condition's own entry", () => {
    const unsettled = PLANTS_PROMOTED_COPIES.slice(0, 2);
    const condition = automationStudioResultSummaryWithAlsoInResult(plantsRunSummary(PLANTS_LEFT_OUT.filter((label) => !unsettled.includes(label)))).reads![0]!.conditions![0]!;
    expect(condition.leftOutAlsoInResult).toEqual(unsettled);
    expect(condition.alsoInResult).toContain("another copy of the same item was kept, so that item is not missing from the result");
    expect(condition.alsoInResult).toContain("A row this condition alone left out that leftOutAlsoInResult does not list is not thereby missing");
    expect(condition.alsoInResult).toContain("accounted for by this condition's own entry");
  });
});
