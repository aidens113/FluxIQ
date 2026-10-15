// The swing of A8 wave 8 (t633, bigbox `run-mv9gbsm5-2957581c`), on another
// kind of site: the park service's campsite search of
// `../../refuted-no/tests/campsite-fixture.ts`. Revision 1 reads without name
// conditions and stores a rental cabin beside the four campsites asked for;
// its judges rightly call the cabin not a campsite and advise excluding rental
// cabins. Revision 2 adds two name conditions, which leave the cabin out
// together -- neither alone, so no read account names it -- and stores exactly
// the four campsites; its judges say no, asking to remove those two
// conditions. No task, site, item or answer of any realistic scenario.
import type { AutomationStudioRunResultSummary } from "../../contracts.ts";
import { CAMP_READ, campsiteRunSummary } from "../../refuted-no/tests/campsite-fixture.ts";

/** The rental cabin revision 1 stores: open this weekend, rated 4.7, and not a campsite. */
export const CAMP_CABIN = { name: "Aspen Grove Rental Cabin 3", fee: "$95", rating: "4.7", url: "/sites/AG2C8R03" };

/** What the judges compare against. */
const EXPECTED = "Every campsite open this weekend and rated 4 or higher, from every page, each once, without promoted entries.";

/** Revision 1's no, from both calls: the cabin named and called not a campsite, and an exclusion of its kind advised. */
export const CABIN_KEPT_NO = {
  expected: EXPECTED,
  observed: `Stored 5 rows, but "${CAMP_CABIN.name}" is a rental cabin, not a campsite: the request asks for campsites.`,
  changed: `Add a condition on ${CAMP_READ} that keeps only campsite rows (exclude rental cabins), so the cabin row is not stored.`
};

/** Revision 1: the read's three conditions only, and the cabin stored beside the four campsites. */
export function cabinKeptSummary(): AutomationStudioRunResultSummary {
  const summary = campsiteRunSummary();
  const set = summary.recordSets[0]!;
  const read = summary.reads![0]!;
  const rows = [...(set.sampleRows ?? []), { ...CAMP_CABIN }];
  return {
    ...summary,
    totalRecordCount: rows.length,
    recordSets: [{ ...set, recordCount: rows.length, rowsChecked: rows.length, sampleRows: rows, processing: { ...set.processing!, collected: rows.length, kept: rows.length } }],
    reads: [{ ...read, kept: rows.length, conditions: read.conditions!.slice(0, 3) }]
  };
}

/** Revision 2: the two name conditions added, which left the cabin out together; exactly the four campsites stored. */
export function cabinLeftOutSummary(): AutomationStudioRunResultSummary {
  return campsiteRunSummary({ together: true });
}
