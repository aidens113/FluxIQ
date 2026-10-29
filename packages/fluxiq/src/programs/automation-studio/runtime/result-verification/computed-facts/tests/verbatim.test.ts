// Each stored cell as the verbatim text of one element of the view it was read
// from (`../verbatim.ts`). The summary does not yet carry, for any stored cell,
// the text it was read from: the end view is the page the run ended on, not
// the list each cell was read off, and `leftOutCells` are left-out rows'. So no
// fact is computed, even where the end view and the stored cells disagree,
// until each cell carries its source (framework plan P5, paired W5).
import { describe, expect, it } from "vitest";
import { automationStudioResultVerbatimFact } from "../verbatim.ts";
import { BOOKS, bookSet, libraryInput, librarySummary } from "./library-fixture.ts";

describe("the verbatim fact", () => {
  it("computes nothing while no stored cell carries the text it was read from", () => {
    const endView = { after: "read_catalogue", view: { text: ["The Quiet Orchard — $7.59", "Salt and Lantern — $9.99"] } };
    const rows = [{ ...BOOKS[0]!, price: "$0.00" }, ...BOOKS.slice(1)];
    expect(automationStudioResultVerbatimFact(libraryInput(librarySummary({ endView, recordSets: [bookSet(rows)] })))).toEqual([]);
    expect(automationStudioResultVerbatimFact(libraryInput(librarySummary()))).toEqual([]);
  });
});
