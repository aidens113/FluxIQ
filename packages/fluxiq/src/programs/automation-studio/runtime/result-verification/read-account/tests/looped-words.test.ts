// How Core says a read whose step ran as the passes of a loop: by how the loop
// ended, in Core's own words, and with the loop's Repeat as the thing to raise.
// Never a read's own paging setting, and never a word of the medium's.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../../contracts.ts";
import { automationStudioResultSummaryWithPagingWords } from "../judge-paging.ts";
import { automationStudioResultReadPageBoundSentence } from "../page-bound-sentence.ts";
import { automationStudioResultReadPagesClause } from "../pages-clause.ts";
import { automationStudioResultReadSentence } from "../sentence.ts";
import { automationStudioResultReadStop } from "../stop.ts";

const looped = (overrides: Partial<AutomationStudioResultReadAccount> = {}): AutomationStudioResultReadAccount => ({
  nodeId: "read", definitionId: "opaque.read", pagesRead: 5, pageLimit: 50, stop: "ended", truncated: false, kept: 13, paginates: true,
  attempts: 5, keptPerPage: [3, 3, 3, 2, 2], ...overrides
});
const judged = (read: AutomationStudioResultReadAccount) => {
  const summary: AutomationStudioRunResultSummary = {
    schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: read.kept, totalRefusedCount: 0, totalRowsMissingRequired: 0,
    recordSetCount: 1, recordSets: [], flowShape: [], withheld: false, reads: [read]
  };
  return automationStudioResultSummaryWithPagingWords(summary).reads?.[0] as AutomationStudioResultReadAccount & { paging: string };
};
const MEDIUM_WORDS = /maxPages|maxScrolls|Next|paginat|click|button|scroll/u;

describe("the words for a looped read", () => {
  it("reads the loop's own stop words as the list ending, the bound, or neither", () => {
    expect(automationStudioResultReadStop(looped())).toBe("list_ended");
    expect(automationStudioResultReadStop(looped({ stop: "bound", pagesRead: 50 }))).toBe("page_bound");
    expect(automationStudioResultReadStop(looped({ stop: "failed" }))).toBe("other");
    const { stop: _stop, ...unseen } = looped();
    expect(automationStudioResultReadStop(unseen)).toBe("other");
    // Outside a loop the words keep their old reading: `ended` is no domain word.
    const { keptPerPage: _pages, ...plain } = looped();
    expect(automationStudioResultReadStop(plain)).toBe("other");
  });

  it("says each way the loop ended as a clause", () => {
    expect(automationStudioResultReadPagesClause(looped())).toBe("every page (5) and the list ended: the step that moves it on found no page after page 5");
    expect(automationStudioResultReadPagesClause(looped({ stop: "bound", pagesRead: 3, pageLimit: 3, keptPerPage: [4, 4, 4] })))
      .toBe("3 pages over 3 passes of its loop, until the loop's bound of 3 passes stopped it");
    expect(automationStudioResultReadPagesClause(looped({ stop: "failed", pagesRead: 2, keptPerPage: [4, 2], truncated: true })))
      .toBe("2 pages over 2 passes of its loop, until a step of the loop failed, cut short by a limit");
    const { stop: _stop, ...unseen } = looped({ pagesRead: 1, keptPerPage: [3] });
    expect(automationStudioResultReadPagesClause(unseen)).toBe("1 page over 1 pass of its loop");
  });

  it("tells a read its loop's bound stopped to raise the Repeat's most, and never names a setting of the read's", () => {
    const read = looped({ stop: "bound", pagesRead: 3, pageLimit: 3, keptPerPage: [4, 4, 4] });
    const sentence = automationStudioResultReadPageBoundSentence(read);
    expect(sentence).toBe("The loop's bound stopped it at 3 passes, not the list, so the list may go on: raise the most passes (`most`) of the Repeat that loops it if the request needs rows past page 3.");
    expect(sentence).not.toMatch(MEDIUM_WORDS);
  });

  it("says a looped read briefly with each page's rows and that it reads a page a pass", () => {
    const brief = automationStudioResultReadSentence(looped(), "brief");
    expect(brief).toBe("step read read every page (5) and the list ended: the step that moves it on found no page after page 5 and kept 13 (3, 3, 3, 2, 2 by page, one pass of its loop each); it reads a page a pass of a loop");
    expect(brief).not.toContain("the last of");
    expect(brief).not.toMatch(MEDIUM_WORDS);
  });

  it("tells the re-author a looped read already loops, and that more passes read nothing more after the list ended", () => {
    const ended = automationStudioResultReadSentence(looped(), "full");
    expect(ended).toContain("It already runs in a loop that reads a page a pass, and read to the end of the list, so more passes would read nothing more; do not add another loop around it.");
    expect(ended).not.toMatch(MEDIUM_WORDS);
    const bound = automationStudioResultReadSentence(looped({ stop: "bound", pagesRead: 3, pageLimit: 3, keptPerPage: [4, 4, 4] }), "full");
    expect(bound).toContain("It already runs in a loop that reads a page a pass; do not add another loop around it.");
    expect(bound).toContain("raise the most passes (`most`) of the Repeat that loops it");
    expect(bound).not.toMatch(MEDIUM_WORDS);
  });

  it("shows the judge an ended loop as no further page, a bound loop as one that may go on, and a failed one as neither", () => {
    expect(judged(looped()).paging).toBe("Read every page (5) and the list ended: the step that moves it on found no page after page 5. There is no further page.");
    const bound = judged(looped({ stop: "bound", pagesRead: 3, pageLimit: 3, keptPerPage: [4, 4, 4] })).paging;
    expect(bound).toContain("until the loop's bound of 3 passes stopped it.");
    expect(bound).toContain("raise the most passes (`most`) of the Repeat that loops it");
    const failed = judged(looped({ stop: "failed", pagesRead: 2, keptPerPage: [4, 2] })).paging;
    expect(failed).toBe("Read 2 pages over 2 passes of its loop, until a step of the loop failed.");
    for (const said of [bound, failed]) expect(said).not.toMatch(MEDIUM_WORDS);
  });
});
