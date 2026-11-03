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
