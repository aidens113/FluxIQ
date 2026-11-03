// Whether a request asks for every result it looks through (`../every-result.ts`, t795).
import { describe, expect, it } from "vitest";
import { automationStudioRequestAsksEveryResult } from "../index.ts";

describe("a request that asks for every result", () => {
  it("is read from a quantifier before a row noun", () => {
    expect(automationStudioRequestAsksEveryResult("Search the catalog for garden tools and list every result on the first page, leaving out reference copies.")).toBe(true);
    expect(automationStudioRequestAsksEveryResult("Collect every search result on the first page.")).toBe(true);
    expect(automationStudioRequestAsksEveryResult("Save all of the results the archive shows.")).toBe(true);
    expect(automationStudioRequestAsksEveryResult("Record each listing's title and year.")).toBe(true);
  });

  it("is not read from a request for a kind of thing (t628)", () => {
    expect(automationStudioRequestAsksEveryResult("Find garden gloves and list them with their price.")).toBe(false);
    expect(automationStudioRequestAsksEveryResult("List the three newest titles in the catalog.")).toBe(false);
    expect(automationStudioRequestAsksEveryResult(undefined)).toBe(false);
  });

  it("is not read where the words between narrow the rows by a judgement", () => {
    expect(automationStudioRequestAsksEveryResult("List all the relevant results for garden tools.")).toBe(false);
    expect(automationStudioRequestAsksEveryResult("Keep every matching item.")).toBe(false);
  });
});
