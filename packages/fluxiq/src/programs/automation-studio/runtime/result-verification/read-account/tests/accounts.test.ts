// How a list read went, joined from the run record's account of the read and
// the parameters the Flow authored the step with. The defect it closes:
// `run-munq5s8x-6d620cdf`'s judge and re-author were told "8 records stored" of
// a read that had paged five times and filtered on four conditions.
import { describe, expect, it } from "vitest";
import { automationStudioResultReadAccounts } from "../accounts.ts";
import { automationStudioResultReadSentence } from "../sentence.ts";
import { EARBUDS_LOCATORS, EARBUDS_NODE_ID, earbudsAttempt, earbudsNode } from "./earbuds-read.ts";

/** The earbuds attempt with the read's own `conditions.seen`. */
function withSeen(seen: Array<string | number | null>) {
  const attempt = earbudsAttempt();
  const extraction = attempt.metadata!.extraction as Record<string, unknown>;
  return earbudsAttempt({ metadata: { extraction: { ...extraction, conditions: { ...(extraction.conditions as object), seen } } } as never });
}

/** The earbuds step with its first condition on the Brightaisle Plus icon's accessible name, as `run-munw7ffn-fe1cecd2` authored it. */
function plusNode() {
  const node = earbudsNode();
  const read = node.parameterValues!.extractList as { where: Array<Record<string, unknown>> };
  read.where[0] = { read: { kind: "attribute", selector: ".result-card .plus-badge i", attribute: "aria-label", required: false }, is: "present" };
  return node;
}

describe("a read's account", () => {
  it("says the pages, the stop, the items, and each condition as written with the rows it rejected", () => {
    const { reads, withheld } = automationStudioResultReadAccounts({ actionAttempts: [earbudsAttempt()], flowNodes: [earbudsNode()], deniedEvidenceKeys: [] });
    expect(withheld).toBe(false);
    expect(reads).toEqual([{
      nodeId: EARBUDS_NODE_ID,
      definitionId: "web.output.dom-extract_list",
      pagesRead: 5,
      pageLimit: 5,
      stop: "page_limit",
      truncated: false,
      itemsSeen: 56,
      kept: 8,
      paginates: true,
      dedupes: true,
      dedupeBy: ["url"],
      conditions: [
        { condition: "attribute data-sponsored is absent", rejected: 13 },
        { condition: "rating atLeast 4", rejected: 20 },
        { condition: "price lessThan 50", rejected: 27 },
        // The read of the name column is the name column's own read, so it is named by the column.
        { condition: "name not contains [\"ear tips\", \"charging case\"]", rejected: 16 }
      ]
    }]);
  });

  it("never carries a locator the step was authored with", () => {
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [earbudsAttempt()], flowNodes: [earbudsNode()], deniedEvidenceKeys: [] });
    const sent = JSON.stringify(reads) + automationStudioResultReadSentence(reads[0]!, "full");
    for (const locator of EARBUDS_LOCATORS) expect(sent).not.toContain(locator);
  });

  it("withholds a compared value shaped like a locator, and keeps the count", () => {
    const node = earbudsNode();
    const read = node.parameterValues!.extractList as { where: Array<Record<string, unknown>> };
    read.where[3] = { field: "name", contains: [".sponsored-badge", "ear tips"] };
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [earbudsAttempt()], flowNodes: [node], deniedEvidenceKeys: [] });
    expect(reads[0]?.conditions?.[3]).toEqual({ condition: "name contains [(withheld), \"ear tips\"]", rejected: 16 });
  });

  // `run-munw7ffn-fe1cecd2`: a condition on the Brightaisle Plus icon's accessible
  // name reached the judge as `attribute aria-label is present`, and it advised
  // adding the Plus condition the Flow already had.
  it("says what a condition's own read found beside it, and nothing beside a condition over a column", () => {
    const seen = ["Brightaisle Plus", "4.5 out of 5 stars", null, "Pro Earbuds"];
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [withSeen(seen)], flowNodes: [plusNode()], deniedEvidenceKeys: [] });
    expect(reads[0]?.conditions).toEqual([
      { condition: "attribute aria-label (read \"Brightaisle Plus\" on a row it kept) is present", rejected: 13 },
      // These three are their columns' own reads, named by the column, whose values are the rows: none is said.
      { condition: "rating atLeast 4", rejected: 20 },
      { condition: "price lessThan 50", rejected: 27 },
      { condition: "name not contains [\"ear tips\", \"charging case\"]", rejected: 16 }
    ]);
    const full = automationStudioResultReadSentence(reads[0]!, "full");
    expect(full).toContain("attribute aria-label (read \"Brightaisle Plus\" on a row it kept) is present rejected 13 rows");
    for (const locator of [...EARBUDS_LOCATORS, ".plus-badge"]) expect(JSON.stringify(reads) + full).not.toContain(locator);
  });

  it("withholds a found value shaped like a locator or a secret, or naming a denied key, and keeps the condition and its count", () => {
    const said = (value: string | number) =>
      automationStudioResultReadAccounts({ actionAttempts: [withSeen([value, null, null, null])], flowNodes: [plusNode()], deniedEvidenceKeys: ["inner_html"] }).reads;
    // The contrast: a plain value is said.
    expect(said("Brightaisle Plus")[0]?.conditions?.[0]?.condition).toBe("attribute aria-label (read \"Brightaisle Plus\" on a row it kept) is present");
    for (const value of [".plus-badge > i", "aria-label=Plus", "sk-abcdefghij0123456789abcdef", "innerHTML", 7]) {
      const reads = said(value);
      expect(reads[0]?.conditions?.[0], String(value)).toEqual({ condition: "attribute aria-label is present", rejected: 13 });
      if (typeof value === "string") expect(JSON.stringify(reads)).not.toContain(value);
    }
  });

  it("carries counts alone where the domain declared no keys, since absent means nobody said", () => {
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [earbudsAttempt()], flowNodes: [earbudsNode()] });
    expect(reads[0]).toMatchObject({ pagesRead: 5, stop: "page_limit", kept: 8, conditions: [{ rejected: 13 }, { rejected: 20 }, { rejected: 27 }, { rejected: 16 }] });
    expect(reads[0]).not.toHaveProperty("paginates");
    expect(JSON.stringify(reads)).not.toContain("ear tips");
  });

  it("speaks for a retried step with its last successful read, and says how many there were", () => {
    const failed = earbudsAttempt({ attemptId: "attempt.s6.b", status: "failed", metadata: { extraction: { recordCount: 0, pagesRead: 1, truncated: false } } });
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [earbudsAttempt(), failed], flowNodes: [earbudsNode()], deniedEvidenceKeys: [] });
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({ pagesRead: 5, kept: 8, attempts: 2 });
  });

  it("says a step that reported no read nothing, and a record without the account nothing either", () => {
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [earbudsAttempt({ metadata: { recordCount: 8 } })], flowNodes: [earbudsNode()], deniedEvidenceKeys: [] });
    expect(reads).toEqual([]);
  });

  it("reads as a sentence that names the stop and each condition's rejections", () => {
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [earbudsAttempt()], flowNodes: [earbudsNode()], deniedEvidenceKeys: [] });
    expect(automationStudioResultReadSentence(reads[0]!, "brief")).toBe(
      `step ${EARBUDS_NODE_ID} read 5 pages of at most 5, paging stopped on page_limit and kept 8 of 56 items seen; it pages, keeps one row per url, its 4 conditions rejected 13, 20, 27, 16 rows`
    );
    const full = automationStudioResultReadSentence(reads[0]!, "full");
    expect(full).toContain("It already follows pages");
    expect(full).toContain("It already keeps one row per url.");
    expect(full).toContain("name not contains [\"ear tips\", \"charging case\"] rejected 16 rows");
  });
});
