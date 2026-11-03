// The stored row count against the rows a part's answer declares (K2,
// `../count.ts`): too many is a Core no; too few only where Core's own record
// shows rows that passed every condition cut by a limit, or a list read on past
// that nothing could have refused; anything else is left to the judge.
import { describe, expect, it } from "vitest";
import type { AutomationStudioBuildTestStore } from "../../contracts/index.ts";
import { automationStudioResultCountFact } from "../count.ts";
import { BOOKS, bookSet, catalogueRead, checklistOf, libraryInput, librarySummary } from "./library-fixture.ts";

const WORDS = "List the 3 newest paperbacks under $15 in the catalogue";
const asked = (rows: { count?: number; atLeast?: number; atMost?: number }) => checklistOf({ kind: "records", columns: ["title", "author", "price"], rows });
const four = [...BOOKS, { title: "Ferns in Winter", author: "Ines Holm", price: "$8.00", format: "Paperback" }];
const two = BOOKS.slice(0, 2);

describe("the count fact", () => {
  it("says nothing where no part declares rows, or the answer is not one record set", () => {
    expect(automationStudioResultCountFact(libraryInput(librarySummary()))).toEqual([]);
    expect(automationStudioResultCountFact(libraryInput(librarySummary({ taskChecklist: checklistOf({ kind: "records", columns: [] }) })))).toEqual([]);
    const twoSets = librarySummary({ taskChecklist: asked({ count: 3 }), recordSets: [bookSet(), bookSet(BOOKS, { datasetId: "authors" })] });
    expect(automationStudioResultCountFact(libraryInput(twoSets))).toEqual([]);
  });

  it("holds where the stored rows are the count asked, and is said as settled", () => {
    const facts = automationStudioResultCountFact(libraryInput(librarySummary({ taskChecklist: asked({ count: 3 }) })));
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ kind: "count", status: "holds" });
    expect(facts[0]!.defects).toBeUndefined();
    expect(facts[0]!.said).toContain("3");
  });

  it("fails where more rows are stored than the count or the most asked, held to the part's own words", () => {
    for (const rows of [{ count: 3 }, { atMost: 3 }]) {
      const [fact] = automationStudioResultCountFact(libraryInput(librarySummary({ taskChecklist: asked(rows), recordSets: [bookSet(four)] })));
      expect(fact).toMatchObject({ kind: "count", status: "fails" });
      expect(fact!.defects).toEqual([{ kind: "kept_not_asked", row: "books", value: "4 rows", requestWords: WORDS }]);
    }
  });

  it("says nothing where fewer rows are stored and Core's record shows no matching row was lost", () => {
    expect(automationStudioResultCountFact(libraryInput(librarySummary({ taskChecklist: asked({ count: 3 }), recordSets: [bookSet(two)] })))).toEqual([]);
    // The list went on past the read, but a condition of the read could have refused what it never read.
    const conditioned = librarySummary({ taskChecklist: asked({ atLeast: 3 }), recordSets: [bookSet(two)], reads: [catalogueRead({ stop: "page_limit", pageLimit: 1, kept: 2, conditions: [{ number: 1, condition: "price atMost 15", rejected: 4, alone: 4 }] })] });
    expect(automationStudioResultCountFact(libraryInput(conditioned))).toEqual([]);
  });

  it("fails short where a limit cut rows that passed every condition", () => {
    const cut = bookSet(two, { processing: { collected: 5, duplicates: 0, filteredOut: 0, cut: 3, kept: 2, passes: [{ node: "read_catalogue", pass: 1, rows: 5, newRows: 5 }] } });
    const [fact] = automationStudioResultCountFact(libraryInput(librarySummary({ taskChecklist: asked({ count: 3 }), recordSets: [cut] })));
    expect(fact).toMatchObject({ kind: "count", status: "fails" });
    expect(fact!.defects).toEqual([{ kind: "asked_missing", row: "books", value: "2 rows", requestWords: WORDS }]);
    expect(fact!.said).toContain("3");
  });

  it("fails short where a read with no condition stopped at its own page bound while the list went on", () => {
    const bounded = librarySummary({ taskChecklist: asked({ atLeast: 3 }), recordSets: [bookSet(two)], reads: [catalogueRead({ stop: "page_limit", pageLimit: 1, itemsSeen: 2, kept: 2 })] });
    const [fact] = automationStudioResultCountFact(libraryInput(bounded));
    expect(fact).toMatchObject({ kind: "count", status: "fails", defects: [{ kind: "asked_missing", row: "books", value: "2 rows" }] });
  });

  it("reads a build test by what its Flow would store, only where the answer was made", () => {
    const made: AutomationStudioBuildTestStore = { dataset: "books", writeMode: "append", steps: [3], passes: 1, collected: 4, answer: { rows: 4, labels: [] }, removed: { duplicates: 0, filteredOut: 0, cut: 0 } };
    const test = (store: AutomationStudioBuildTestStore) => librarySummary({ taskChecklist: asked({ count: 3 }), recordSets: [], recordSetCount: 0, totalRecordCount: 0, buildTest: { kind: "build_test", test: "ran", steps: [], stores: [store] } });
    expect(automationStudioResultCountFact(libraryInput(test(made)))[0]).toMatchObject({ status: "fails", defects: [{ kind: "kept_not_asked", row: "books", value: "4 rows" }] });
    const { removed: _removed, ...asCollected } = made;
    expect(automationStudioResultCountFact(libraryInput(test(asCollected)))).toEqual([]);
  });

  it("takes the caller's declaration where it holds one, held to the request's own words", () => {
    const facts = automationStudioResultCountFact(libraryInput(librarySummary({ recordSets: [bookSet(four)] }), undefined, { parts: [{ part: "p1", columns: [], rows: { count: 3 } }] }));
    expect(facts[0]).toMatchObject({ status: "fails" });
    expect(libraryInput(librarySummary()).requestText).toContain(facts[0]!.defects![0]!.requestWords);
  });
});
