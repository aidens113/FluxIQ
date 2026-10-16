// A kept row that alone has no value in a column the answer asks for is
// flagged, and a yes that does not name it beside a quote of the request is
// held, never refused (t663, A8 towels `run-mvahlxuu-760d9e28`, fix 1).
import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultKeptWithoutAskedColumn } from "../kept-without-asked-column.ts";
import { ATLASES, BOOKMARK, atlasRow, atlasRunSummary, atlasWithBookmarkSummary, atlasWording } from "./kept-rows-fixture.ts";

const yes = (summary: AutomationStudioRunResultSummary, observed: string) => automationStudioResultVerdict({
  summary,
  diagnosis: { answersRequest: "yes", expected: "Every hardcover atlas with title, pages and isbn.", observed },
  basis: "model",
  wording: atlasWording(summary)
});

const PLAIN_YES = "10 rows stored, each an atlas with its title and isbn; no requested item is missing.";

describe("a kept row without a value in an answer column", () => {
  it("is flagged, with the column and the rows it was measured among", () => {
    expect(automationStudioResultKeptWithoutAskedColumn(atlasWithBookmarkSummary())).toEqual([
      expect.objectContaining({ kind: "column", datasetId: "atlases", missing: "pages", rows: [BOOKMARK], of: 10 })
    ]);
  });

  it("holds a yes that does not name it: unsure, never a no, the row in Core's line", () => {
    const verification = yes(atlasWithBookmarkSummary(), PLAIN_YES);
    expect(verification.verdict).toBe("unsure");
    expect(verification.code).toBe("core.result.exclusion_evidence_missing");
    expect(verification.yesUnconfirmed).toBe(true);
    expect(verification.repair).toBeUndefined();
    expect(verification.exclusionEvidenceMissing).toEqual([expect.stringContaining(BOOKMARK)]);
    expect(verification.exclusionEvidenceMissing![0]).toContain(`no value in the column "pages"`);
  });

  it("holds a yes that names it without quoting the request", () => {
    const verification = yes(atlasWithBookmarkSummary(), `${PLAIN_YES} Atlas Bookmark Set, Brass is kept too, as an atlas accessory.`);
    expect(verification.verdict).toBe("unsure");
    expect(verification.code).toBe("core.result.exclusion_evidence_missing");
  });

  it("takes a yes that names it in a sentence quoting the request's words", () => {
    const verification = yes(atlasWithBookmarkSummary(), `${PLAIN_YES} Atlas Bookmark Set, Brass has no page count, and the request asks for "every hardcover atlas", which a boxed set of atlas bookmarks is sold beside.`);
    expect(verification.verdict).toBe("answers");
    expect(verification.code).toBe("core.result.answers_request");
  });

  it("flags nothing on an ordinary list whose every row carries every column, and takes its yes", () => {
    const summary = atlasRunSummary(ATLASES.map(atlasRow), ["title", "pages", "isbn"]);
    expect(automationStudioResultKeptWithoutAskedColumn(summary)).toEqual([]);
    expect(yes(summary, PLAIN_YES).verdict).toBe("answers");
  });

  it("flags nothing for a column empty on every row: that is a broken read, not a kept row unlike the rest", () => {
    const rows = [...ATLASES, BOOKMARK].map((title, index) => {
      const { pages: _pages, ...row } = atlasRow(title, index);
      return row;
    });
    expect(automationStudioResultKeptWithoutAskedColumn(atlasRunSummary(rows, ["title", "pages", "isbn"]))).toEqual([]);
  });

  it("flags nothing past its threshold: two of ten rows without the column, or fewer than four other rows carrying it", () => {
    const two = [...ATLASES.slice(0, 8), BOOKMARK, "Atlas Stand, Walnut"].map((title, index) => {
      const row = atlasRow(title, index);
      if (index < 8) return row;
      const { pages: _pages, ...rest } = row;
      return rest;
    });
    expect(automationStudioResultKeptWithoutAskedColumn(atlasRunSummary(two, ["title", "pages", "isbn"]))).toEqual([]);
    const { pages: _pages, ...bookmark } = atlasRow(BOOKMARK, 3);
    expect(automationStudioResultKeptWithoutAskedColumn(atlasRunSummary([...ATLASES.slice(0, 3).map(atlasRow), bookmark], ["title", "pages", "isbn"]))).toEqual([]);
  });

  it("measures the answer's own columns where the Flow states them, and the stored columns where it does not", () => {
    const rows = [...ATLASES, BOOKMARK].map((title, index) => {
      const row = atlasRow(title, index);
      if (title !== BOOKMARK) return row;
      const { url: _url, ...rest } = row;
      return rest;
    });
    expect(automationStudioResultKeptWithoutAskedColumn(atlasRunSummary(rows, ["title", "pages", "isbn"]))).toEqual([]);
    expect(automationStudioResultKeptWithoutAskedColumn(atlasRunSummary(rows))).toEqual([expect.objectContaining({ missing: "url", rows: [BOOKMARK] })]);
  });

  it("measures nothing where the set's rows were not all sent", () => {
    const summary = atlasWithBookmarkSummary();
    const cut = { ...summary, recordSets: summary.recordSets.map((set) => ({ ...set, recordCount: 40 })) };
    expect(automationStudioResultKeptWithoutAskedColumn(cut)).toEqual([]);
  });
});
