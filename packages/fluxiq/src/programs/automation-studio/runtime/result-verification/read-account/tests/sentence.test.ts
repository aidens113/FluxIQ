// How a read says why its paging stopped. The defect it closes:
// `run-muq66ff9-cb3767a1`'s judge was told "read 5 pages of at most 5, paging
// stopped on control_disabled" -- a list whose Next was disabled on its last
// page -- read it as the page bound, and sent the re-author to raise maxPages.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultReadAccount } from "../../contracts.ts";
import { automationStudioResultReadAccounts } from "../accounts.ts";
import { automationStudioResultReadSentence } from "../sentence.ts";
import { EARBUDS_NODE_ID, earbudsAttempt, earbudsNode } from "./earbuds-read.ts";

/** The earbuds read with its own account of paging replaced. */
function readWith(extraction: { pagesRead: number; paginationStop?: string; truncated?: boolean }): AutomationStudioResultReadAccount {
  const attempt = earbudsAttempt();
  const { paginationStop: _stop, ...base } = attempt.metadata!.extraction as Record<string, unknown>;
  const changed = earbudsAttempt({ metadata: { extraction: { ...base, truncated: false, ...extraction } } as never });
  return automationStudioResultReadAccounts({ actionAttempts: [changed], flowNodes: [earbudsNode()], deniedEvidenceKeys: [] }).reads[0]!;
}

const both = (read: AutomationStudioResultReadAccount): string[] =>
  [automationStudioResultReadSentence(read, "brief"), automationStudioResultReadSentence(read, "full")];

describe("why a read's paging stopped", () => {
  it("says a list whose next control was disabled on the bound's last page was read to its end, never as a bound to raise", () => {
    const read = readWith({ pagesRead: 5, paginationStop: "control_disabled" });
    for (const said of both(read)) {
      expect(said).toContain(`tep ${EARBUDS_NODE_ID} read every page (5) and the list ended: its next control was disabled on page 5 and kept 8 of 56 items seen`);
      expect(said).not.toContain("of at most");
      expect(said).not.toMatch(/raise|maxPages/u);
    }
    expect(automationStudioResultReadSentence(read, "full")).toContain("read to the end of the list, so a higher page bound would read nothing more");
  });

  it("says each word the list ends a read with as the list ending", () => {
    expect(automationStudioResultReadSentence(readWith({ pagesRead: 3, paginationStop: "no_following_page" }), "brief"))
      .toContain("read every page (3) and the list ended: its pager showed no page after page 3 and kept");
    expect(automationStudioResultReadSentence(readWith({ pagesRead: 4, paginationStop: "control_absent" }), "brief"))
      .toContain("read every page (4) and the list ended: no next control was on page 4 and kept");
    expect(automationStudioResultReadSentence(readWith({ pagesRead: 2, paginationStop: "scrolled_to_end" }), "brief"))
      .toContain("read every page (2) and the list ended: it scrolled to the end of the list and kept");
    // On the first page, an absent control is also what a next control naming nothing looks like: both are said.
    const first = automationStudioResultReadSentence(readWith({ pagesRead: 1, paginationStop: "control_absent" }), "full");
    expect(first).toContain("read every page (1) and the list ended: no next control was on the first page, which a next control that names nothing on the page would also show");
    expect(first).not.toMatch(/raise|maxPages/u);
  });

  it("says a read that stopped short of its bound without a word as the list ending before the bound", () => {
    const read = readWith({ pagesRead: 3 });
    for (const said of both(read)) {
      expect(said).toContain("read every page (3) and the list ended before its page bound of 5 and kept");
      expect(said).not.toMatch(/raise|maxPages/u);
    }
  });

  it("tells a read its page bound stopped that the list may go on, and how to read further", () => {
    const read = readWith({ pagesRead: 5, paginationStop: "page_limit" });
    expect(automationStudioResultReadSentence(read, "brief")).toContain("read 5 pages of at most 5, paging stopped on page_limit and kept 8");
    const full = automationStudioResultReadSentence(read, "full");
    expect(full).toContain("Its page bound stopped it at 5, not the list, so the list may go on: raise its maxPages (maxScrolls for a read that scrolls) if the request needs rows past page 5.");
    expect(full).not.toContain("list ended");
    // A read that said no word, read all its bound allowed and reports itself truncated was stopped by the bound too.
    expect(automationStudioResultReadSentence(readWith({ pagesRead: 5, truncated: true }), "full")).toContain("raise its maxPages");
  });

  it("says any other stop as its word, never as the list ending and never as a bound to raise", () => {
    const read = readWith({ pagesRead: 2, paginationStop: "rate_limited", truncated: true });
    for (const said of both(read)) {
      expect(said).toContain("read 2 pages, paging stopped on rate_limited before its page bound of 5, cut short by a limit and kept");
      expect(said).not.toContain("list ended");
      expect(said).not.toMatch(/raise|maxPages/u);
    }
  });
});
