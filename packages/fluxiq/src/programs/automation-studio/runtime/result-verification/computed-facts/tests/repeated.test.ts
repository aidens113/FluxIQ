// Rows the answer stores twice (`../repeated.ts`): the same whole row, or two
// rows with the same values in the columns the read identifies a row by, is a
// Core no naming the rows; a build test's repeated labels, which may be two
// rows that differ in every other column, are left to the judge.
import { describe, expect, it } from "vitest";
import type { AutomationStudioBuildTestStore } from "../../contracts/index.ts";
import { automationStudioResultRepeatedFact } from "../repeated.ts";
import { BOOKS, bookSet, catalogueRead, libraryInput, librarySummary } from "./library-fixture.ts";

describe("the repeated fact", () => {
  it("holds where every stored row is stored once, rows a dedupe already took out included", () => {
    const deduped = bookSet(BOOKS, { processing: { collected: 5, duplicates: 2, filteredOut: 0, cut: 0, kept: 3, passes: [{ node: "read_catalogue", pass: 1, rows: 5, newRows: 3 }] } });
    for (const set of [bookSet(), deduped]) {
      const facts = automationStudioResultRepeatedFact(libraryInput(librarySummary({ recordSets: [set] })));
      expect(facts).toHaveLength(1);
      expect(facts[0]).toMatchObject({ kind: "repeated", status: "holds" });
    }
  });

  it("fails where the same whole row is stored twice, naming it", () => {
    const set = bookSet([...BOOKS, { ...BOOKS[1]! }]);
    const [fact] = automationStudioResultRepeatedFact(libraryInput(librarySummary({ recordSets: [set] })));
    expect(fact).toMatchObject({ kind: "repeated", status: "fails" });
    expect(fact!.defects).toEqual([{ kind: "other", row: "Salt and Lantern", value: "stored 2 times", requestWords: "List the 3 newest paperbacks under $15 in the catalogue, with columns title, author and price." }]);
    expect(fact!.said).toContain("Salt and Lantern");
  });

  it("fails where two rows share the values the read identifies a row by", () => {
    const set = bookSet([...BOOKS, { ...BOOKS[0]!, price: "$11.00" }]);
    const summary = librarySummary({ recordSets: [set], reads: [catalogueRead({ dedupes: true, dedupeBy: ["title", "author"] })] });
    expect(automationStudioResultRepeatedFact(libraryInput(summary))[0]).toMatchObject({ status: "fails", defects: [{ kind: "other", row: "The Quiet Orchard", value: "stored 2 times" }] });
    // Without a declared identity they are two rows.
    expect(automationStudioResultRepeatedFact(libraryInput(librarySummary({ recordSets: [set] })))[0]).toMatchObject({ status: "holds" });
  });

  it("does not hold over a withheld cell or rows not all read back, and still fails a repeat it can see", () => {
    const withheld = bookSet([...BOOKS.slice(0, 2), { ...BOOKS[2]!, author: "[withheld]" }]);
    expect(automationStudioResultRepeatedFact(libraryInput(librarySummary({ recordSets: [withheld] })))).toEqual([]);
    expect(automationStudioResultRepeatedFact(libraryInput(librarySummary({ recordSets: [bookSet(BOOKS, { recordCount: 8 })] })))).toEqual([]);
    const seen = bookSet([BOOKS[0]!, { ...BOOKS[0]! }], { recordCount: 8 });
    expect(automationStudioResultRepeatedFact(libraryInput(librarySummary({ recordSets: [seen] })))[0]).toMatchObject({ status: "fails" });
  });

  it("says nothing of rows with no value in any stored column, which no row can be told from (t795 integration)", () => {
    const blank = bookSet([{}, {}, {}], { columns: [] });
    expect(automationStudioResultRepeatedFact(libraryInput(librarySummary({ recordSets: [blank] })))).toEqual([]);
    const empty = bookSet([{ title: "", author: "" }, { title: "", author: "" }]);
    expect(automationStudioResultRepeatedFact(libraryInput(librarySummary({ recordSets: [empty] })))).toEqual([]);
  });

  it("leaves a build test's repeated labels to the judge, and holds a made answer with every row labelled once", () => {
    const store: AutomationStudioBuildTestStore = { dataset: "books", writeMode: "append", steps: [3, 5], passes: 2, collected: 4, answer: { rows: 4, labels: ["A", "B", "B", "C"] }, removed: { duplicates: 0, filteredOut: 0, cut: 0 }, repeated: ["B"] };
    const test = (one: AutomationStudioBuildTestStore) => librarySummary({ recordSets: [], recordSetCount: 0, buildTest: { kind: "build_test", test: "ran", steps: [], stores: [one] } });
    expect(automationStudioResultRepeatedFact(libraryInput(test(store)))).toEqual([]);
    const { repeated: _repeated, ...clean } = { ...store, answer: { rows: 3, labels: ["A", "B", "C"] } };
    expect(automationStudioResultRepeatedFact(libraryInput(test(clean)))[0]).toMatchObject({ kind: "repeated", status: "holds" });
  });
});
