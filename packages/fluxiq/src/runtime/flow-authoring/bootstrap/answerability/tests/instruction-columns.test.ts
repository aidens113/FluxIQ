import { describe, expect, it } from "vitest";
import { automationStudioFlowBootstrapInstructionColumns } from "../instruction-columns.ts";

// The columns an instruction names, and where its list of them ends (t515).
//
// Live run `run-mv6v2kzn-d593231f`: an instruction named its columns and then
// how to order the answer, newest first. The reader took the ordering as a
// fourth column, and every judge was told a column existed that no field read.

describe("automationStudioFlowBootstrapInstructionColumns", () => {
  it("reads a plain list of columns unchanged", () => {
    expect(automationStudioFlowBootstrapInstructionColumns("Give me a table with columns name, price, rating and link.")).toEqual(["name", "price", "rating", "link"]);
  });

  it("ends the list after its last item, so an ordering that follows is not a column", () => {
    expect(automationStudioFlowBootstrapInstructionColumns("Return columns title, company, salary and link, newest first.")).toEqual(["title", "company", "salary", "link"]);
  });

  it("ends the list at a clause, so neither the clause nor what follows is a column", () => {
    expect(automationStudioFlowBootstrapInstructionColumns("columns a, b, c, where b is written as shown, newest first")).toEqual(["a", "b", "c"]);
  });

  it("ends the list at an ordering phrase even with no final and", () => {
    expect(automationStudioFlowBootstrapInstructionColumns("columns title, company, cheapest first")).toEqual(["title", "company"]);
    expect(automationStudioFlowBootstrapInstructionColumns("columns title, company, sorted by price")).toEqual(["title", "company"]);
  });

  it("keeps a name that only begins or ends like an ordering word", () => {
    expect(automationStudioFlowBootstrapInstructionColumns("columns first name, last name, order number and email")).toEqual(["first name", "last name", "order number", "email"]);
  });

  it("still skips a part refused only for its characters and reads on", () => {
    expect(automationStudioFlowBootstrapInstructionColumns("columns name, price (GBP), rating")).toEqual(["name", "rating"]);
  });

  it("reads a list joined by and throughout", () => {
    expect(automationStudioFlowBootstrapInstructionColumns("columns name and price and rating")).toEqual(["name", "price", "rating"]);
  });
});

// t877, run `run-mw49972k-cebf67e5`: the closing item ran on past a name and the
// reader answered ["title"], a partial list said as if whole, which the build
// declared and the domain narrowed the saved read to.
describe("a list whose closing item runs on", () => {
  it("answers no columns, and carries the names read and the item's leading words", () => {
    const columns = automationStudioFlowBootstrapInstructionColumns("Give me a table of the shop's listings with columns title and price exactly as the shop shows them.");
    expect([...columns]).toEqual([]);
    expect(columns.cutShort).toEqual({ named: ["title"], leading: ["price exactly as", "price exactly", "price"] });
  });

  it("carries every name read before the closing item", () => {
    expect(automationStudioFlowBootstrapInstructionColumns("columns name, city and order number as printed on the receipt").cutShort)
      .toEqual({ named: ["name", "city"], leading: ["order number as", "order number", "order"] });
  });

  it("leaves a plain list, a clause after the closing item, and an ordering as they were", () => {
    for (const [text, names] of [
      ["Give me a table with columns title and price.", ["title", "price"]],
      ["columns name and email", ["name", "email"]],
      ["columns name and message, where message is the whole text the sender wrote", ["name", "message"]],
      ["columns title and sorted by the date each one was posted", ["title"]]
    ] as const) {
      const columns = automationStudioFlowBootstrapInstructionColumns(text);
      expect([...columns], text).toEqual(names);
      expect(columns.cutShort, text).toBeUndefined();
    }
  });
});

// Run `run-mwblz4aq-0baa810a`: the last column was followed by a colon and its
// explanation, the reader took "date: author is ..." as a closing item that ran
// on, and every leading-words candidate kept the colon, so no column was read.
describe("a colon after a listed column", () => {
  it("ends the list at that column, so its explanation is not read as one", () => {
    const columns = automationStudioFlowBootstrapInstructionColumns("Give me one row per entry with columns author, comment and date: author is who wrote it, comment is its text, and date is the day it was posted.");
    expect([...columns]).toEqual(["author", "comment", "date"]);
    expect(columns.cutShort).toBeUndefined();
  });

  it("ends the list at a colon after an item that is not the last", () => {
    expect(automationStudioFlowBootstrapInstructionColumns("columns author, comment: the whole text, and date")).toEqual(["author", "comment"]);
  });

  it("reads a list the colon opens", () => {
    expect(automationStudioFlowBootstrapInstructionColumns("Use these columns: author, comment and date.")).toEqual(["author", "comment", "date"]);
  });

  it("trims trailing punctuation from a leading-words candidate of an item that runs on", () => {
    // "date -" was offered as it stood before; a name never ends in punctuation.
    expect(automationStudioFlowBootstrapInstructionColumns("columns author and date - the day it was posted as written").cutShort)
      .toEqual({ named: ["author"], leading: ["date - the", "date"] });
  });
});
