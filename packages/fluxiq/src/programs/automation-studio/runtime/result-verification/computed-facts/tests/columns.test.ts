// The requested columns against the stored ones (`../columns.ts`): a column
// the request names that no stored column is, or one empty on every stored
// row, is a Core no; a blank cell on some rows is not; a column whose name only
// shares a word with a stored one is left to the judge.
import { describe, expect, it } from "vitest";
import { automationStudioResultColumnsFact } from "../columns.ts";
import { BOOKS, bookSet, catalogueRead, checklistOf, libraryInput, librarySummary } from "./library-fixture.ts";

const withoutPrice = BOOKS.map(({ price: _price, ...rest }) => rest);

describe("the columns fact", () => {
  it("holds where every column the request names is stored and filled", () => {
    const facts = automationStudioResultColumnsFact(libraryInput(librarySummary()));
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ kind: "columns", status: "holds" });
    expect(facts[0]!.said).toContain("price");
  });

  it("holds with a blank cell on some rows", () => {
    const rows = BOOKS.map((row, index) => (index === 0 ? { ...row, price: "" } : row));
    expect(automationStudioResultColumnsFact(libraryInput(librarySummary({ recordSets: [bookSet(rows)] })))[0]).toMatchObject({ status: "holds" });
  });

  it("fails where a declared column is not among the stored columns", () => {
    const set = bookSet(withoutPrice, { columns: ["title", "author", "format"] });
    const [fact] = automationStudioResultColumnsFact(libraryInput(librarySummary({ recordSets: [set], taskChecklist: checklistOf({ kind: "records", columns: ["price"] }) })));
    expect(fact).toMatchObject({ kind: "columns", status: "fails" });
    expect(fact!.defects).toEqual([{ kind: "asked_missing", row: "books", column: "price", requestWords: "price" }]);
  });

  it("fails where a declared column is empty on every stored row", () => {
    const rows = BOOKS.map((row) => ({ ...row, author: "" }));
    const [fact] = automationStudioResultColumnsFact(libraryInput(librarySummary({ recordSets: [bookSet(rows)], taskChecklist: checklistOf({ kind: "records", columns: ["author"] }) })));
    expect(fact).toMatchObject({ status: "fails", defects: [{ kind: "asked_missing", row: "books", column: "author", requestWords: "author" }] });
  });

  it("leaves a column only the instruction's words name to the judge when it is missing or empty (unread-columns)", () => {
    const set = bookSet(withoutPrice, { columns: ["title", "author", "format"] });
    expect(automationStudioResultColumnsFact(libraryInput(librarySummary({ recordSets: [set] })))).toEqual([]);
    const rows = BOOKS.map((row) => ({ ...row, author: "" }));
    expect(automationStudioResultColumnsFact(libraryInput(librarySummary({ recordSets: [bookSet(rows)] })))).toEqual([]);
  });

  it("holds a declared answer's columns to the part's words, matching a spelling that differs only by case or separators", () => {
    const shelved = BOOKS.map((row, index) => ({ ...row, shelf_mark: `PB-${index + 1}` }));
    const set = bookSet(shelved, { columns: ["title", "author", "price", "format", "shelf_mark"] });
    const matched = librarySummary({ taskChecklist: checklistOf({ kind: "records", columns: ["Title", "Format", "Shelf-Mark"] }), recordSets: [set] });
    expect(automationStudioResultColumnsFact(libraryInput(matched, "List the 3 newest paperbacks under $15 in the catalogue."))[0]).toMatchObject({ status: "holds" });
    const missing = librarySummary({ taskChecklist: checklistOf({ kind: "records", columns: ["Title", "Shelf-Mark", "edition"] }), recordSets: [set] });
    const [fact] = automationStudioResultColumnsFact(libraryInput(missing, "List the 3 newest paperbacks under $15 in the catalogue."));
    expect(fact).toMatchObject({ status: "fails", defects: [{ kind: "asked_missing", row: "books", column: "edition", requestWords: "List the 3 newest paperbacks under $15 in the catalogue" }] });
  });

  it("says nothing where a missing column only shares a word with a stored one, or empty rows are the read's own doing", () => {
    const summary = librarySummary({ taskChecklist: checklistOf({ kind: "records", columns: ["book title"] }) });
    expect(automationStudioResultColumnsFact(libraryInput(summary, "List the 3 newest paperbacks."))).toEqual([]);
    const emptied = librarySummary({
      recordSets: [bookSet(BOOKS.map((row) => ({ ...row, price: "" })))],
      reads: [catalogueRead({ conditions: [{ number: 1, condition: "price is absent", rejected: 2, alone: 2 }] })]
    });
    expect(automationStudioResultColumnsFact(libraryInput(emptied))).toEqual([]);
  });

  it("says nothing where the column list was cut, nothing was stored, rows were not all read back, or it is a build test", () => {
    expect(automationStudioResultColumnsFact(libraryInput(librarySummary({ recordSets: [bookSet(BOOKS, { columnsWithheld: true })] })))).toEqual([]);
    expect(automationStudioResultColumnsFact(libraryInput(librarySummary({ recordSets: [], recordSetCount: 0 })))).toEqual([]);
    const unread = bookSet(BOOKS.map((row) => ({ ...row, author: "" })), { recordCount: 9 });
    expect(automationStudioResultColumnsFact(libraryInput(librarySummary({ recordSets: [unread] })))).toEqual([]);
    expect(automationStudioResultColumnsFact(libraryInput(librarySummary({ buildTest: { kind: "build_test", test: "ran", steps: [] } })))).toEqual([]);
    expect(automationStudioResultColumnsFact(libraryInput(librarySummary(), "List the 3 newest paperbacks."))).toEqual([]);
  });
});
