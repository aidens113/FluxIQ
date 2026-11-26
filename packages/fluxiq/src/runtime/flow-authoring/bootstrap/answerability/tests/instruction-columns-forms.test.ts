import { describe, expect, it } from "vitest";
import { automationStudioFlowBootstrapInstructionColumns } from "../instruction-columns.ts";

// The reader over the ways an instruction names its columns (t1051). A trailing "only" (or "just", "exactly") says the
// list is complete, it is no part of the last name: "with columns title only" once read as the column "title only",
// which no held column is named. Generic instructions, none from a scenario.
const read = (text: string): string[] => [...automationStudioFlowBootstrapInstructionColumns(text)];

describe("the columns an instruction names, in each form", () => {
  it("reads 'with columns X only' as X", () => {
    expect(read("Give me the entries with columns title only.")).toEqual(["title"]);
    expect(read("Give me the entries with columns title only")).toEqual(["title"]);
    expect(read("Give me the entries with columns title just")).toEqual(["title"]);
  });

  it("reads 'columns X and Y only' as X and Y", () => {
    expect(read("a table with columns title and price only.")).toEqual(["title", "price"]);
    expect(read("a table with columns title, price only.")).toEqual(["title", "price"]);
  });

  it("reads 'columns: X, Y' as X and Y", () => {
    expect(read("Return the rows, columns: title, price")).toEqual(["title", "price"]);
  });

  it("reads 'the X and Y of each' as no named column, as before", () => {
    expect(read("Give me the title and price of each item.")).toEqual([]);
  });

  it("keeps a column named with two words whole", () => {
    expect(read("with columns order number, due date and city")).toEqual(["order number", "due date", "city"]);
    expect(read("with columns due date only")).toEqual(["due date"]);
  });

  it("reads an instruction that names no columns as none", () => {
    expect(read("Open the page and tell me what it says.")).toEqual([]);
  });

  it("keeps a name that merely contains or begins with 'only'", () => {
    expect(read("with columns title and only child")).toEqual(["title", "only child"]);
    expect(read("with columns onlyfans, title")).toEqual(["onlyfans", "title"]);
  });
});
