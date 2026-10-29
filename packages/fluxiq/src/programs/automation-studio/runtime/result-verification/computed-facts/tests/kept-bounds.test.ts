// Every `where` bound Core can read, on every row the read kept and the answer
// stored (`../kept-bounds.ts`, extending `../../value-readings/settled-rows.ts`):
// a stored row whose own value fails a numeric bound, a text test or a presence
// test of its read, which the request itself states, is a Core no; a bound Core
// cannot read, a value stating no number, or a bound the request does not state
// is left to the judge.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioResultKeptBoundsFact } from "../kept-bounds.ts";
import { BOOKS, bookSet, catalogueRead, catalogueStep, libraryInput, librarySummary } from "./library-fixture.ts";

const PRICE = { field: "price", atMost: 15 };
const FORMAT = { field: "format", contains: "Paperback" };
const SENTENCE = "List the 3 newest paperbacks under $15 in the catalogue, with columns title, author and price.";
const conditions = (...wording: string[]) => wording.map((condition, index) => ({ number: index + 1, condition, rejected: 0, alone: 0 }));

function summary(where: JsonObject[], rows: JsonObject[] = BOOKS, read: Parameters<typeof catalogueRead>[0] = {}) {
  return librarySummary({ recordSets: [bookSet(rows)], reads: [catalogueRead({ conditions: conditions(...where.map(() => "a condition")), ...read })], flowShape: [catalogueStep(where)] });
}

describe("the kept-bounds fact", () => {
  it("holds where every stored row meets every bound Core reads", () => {
    const facts = automationStudioResultKeptBoundsFact(libraryInput(summary([PRICE, FORMAT])));
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ kind: "kept_bounds", status: "holds" });
    expect(facts[0]!.said).toContain("price");
  });

  it("fails a stored row whose price fails the read's bound, which the request states", () => {
    const rows = [...BOOKS, { title: "Iron Tide", author: "Bo Reyes", price: "$18.00", format: "Paperback" }];
    const [fact] = automationStudioResultKeptBoundsFact(libraryInput(summary([PRICE], rows, { unfiltered: true })));
    expect(fact).toMatchObject({ kind: "kept_bounds", status: "fails" });
    expect(fact!.defects).toEqual([{ kind: "kept_not_asked", row: "Iron Tide", column: "price", value: "$18.00", requestWords: SENTENCE }]);
    expect(fact!.said).toContain("Iron Tide");
  });

  it("fails a stored row whose text fails a text test, and one with no value for a presence test the request asks for", () => {
    const hardcover = [...BOOKS, { title: "Iron Tide", author: "Bo Reyes", price: "$11.00", format: "Hardcover" }];
    expect(automationStudioResultKeptBoundsFact(libraryInput(summary([FORMAT], hardcover)))[0]).toMatchObject({ status: "fails", defects: [{ kind: "kept_not_asked", row: "Iron Tide", column: "format", value: "Hardcover" }] });
    const unpriced = [...BOOKS, { title: "Iron Tide", author: "Bo Reyes", price: "", format: "Paperback" }];
    const [presence] = automationStudioResultKeptBoundsFact(libraryInput(summary([{ field: "price", is: "present" }], unpriced), "List paperbacks that show a price."));
    expect(presence).toMatchObject({ status: "fails", defects: [{ kind: "kept_not_asked", row: "Iron Tide", column: "price", requestWords: "List paperbacks that show a price." }] });
  });

  it("says nothing of a failing row whose bound the request does not state", () => {
    const rows = [...BOOKS, { title: "Iron Tide", author: "Bo Reyes", price: "$18.00", format: "Paperback" }];
    expect(automationStudioResultKeptBoundsFact(libraryInput(summary([{ field: "price", atMost: 16 }], rows)))).toEqual([]);
  });

  it("says nothing over a value stating no number, a date bound, a condition Core's grammar does not read, or rows not all read back", () => {
    const free = [...BOOKS, { title: "Iron Tide", author: "Bo Reyes", price: "ask at desk", format: "Paperback" }];
    expect(automationStudioResultKeptBoundsFact(libraryInput(summary([PRICE], free)))).toEqual([]);
    expect(automationStudioResultKeptBoundsFact(libraryInput(summary([{ field: "price", atLeast: "2026-01-01", as: "date" }])))).toEqual([]);
    expect(automationStudioResultKeptBoundsFact(libraryInput(summary([{ field: "price", cheaperThan: 15 }])))).toEqual([]);
    const partial = librarySummary({ recordSets: [bookSet(BOOKS, { recordCount: 7 })], reads: [catalogueRead({ conditions: conditions("price atMost 15") })], flowShape: [catalogueStep([PRICE])] });
    expect(automationStudioResultKeptBoundsFact(libraryInput(partial))).toEqual([]);
  });

  it("says nothing of a set another read also wrote, whose rows are not all this read's", () => {
    const rows = [...BOOKS, { title: "Iron Tide", author: "Bo Reyes", price: "$18.00", format: "Paperback" }];
    const shared = bookSet(rows, { processing: { collected: 4, duplicates: 0, filteredOut: 0, cut: 0, kept: 4, passes: [{ node: "read_catalogue", pass: 1, rows: 3, newRows: 3 }, { node: "read_shelf", pass: 1, rows: 1, newRows: 1 }] } });
    const two = librarySummary({ recordSets: [shared], reads: [catalogueRead({ conditions: conditions("price atMost 15") })], flowShape: [catalogueStep([PRICE])] });
    expect(automationStudioResultKeptBoundsFact(libraryInput(two))).toEqual([]);
  });
});
