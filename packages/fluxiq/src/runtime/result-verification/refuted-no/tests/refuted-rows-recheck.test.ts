// The recheck of a no whose every defect row Core's record refutes (t810,
// `../refuted-rows-recheck.ts`): Core's evidence for each row, in the reverse
// of the no's order, under Core's own words, which name no site or kind of set.
import { describe, expect, it } from "vitest";
import { automationStudioResultRefutedRowsRecheck } from "../index.ts";

describe("the recheck of a no Core's record of its rows refutes (t810)", () => {
  const words = automationStudioResultRefutedRowsRecheck([
    { row: "Atlas of Rivers", evidence: "cell_differs", quote: "format: \"Hardcover\"", value: "Audiobook" },
    { row: "Tide Tables", evidence: "outside_mark", quote: "\"Request a copy\" for \"Coastal Shelf\"" }
  ]);

  it("quotes each row's evidence, the rows reversed", () => {
    expect(words).toContain("- \"Tide Tables\": its item showed the person \"Request a copy\" for \"Coastal Shelf\".");
    expect(words).toContain("- \"Atlas of Rivers\": its own cell is format: \"Hardcover\", not \"Audiobook\".");
    expect(words.indexOf("Tide Tables")).toBeLessThan(words.indexOf("Atlas of Rivers"));
  });

  it("asks the converse, starting from the rows", () => {
    expect(words).toContain("start from those rows, not from the request");
    expect(words).toContain("Where no such defect remains, answer yes");
  });

  it("says nothing of a site, a task or a kind of set in Core's own words", () => {
    expect(words.split("Core's record of those rows:")[0]).not.toMatch(/\b(?:group|join|friend|member|post|feed|social|circle|club|book|library)\w*/iu);
  });
});
