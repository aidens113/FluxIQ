// A read of one part of a list that goes on past it says so (F8).
//
// Live run `run-mveaaqxn-d0be9888`: a trial's read saw 5 items of a list that
// went on, kept 1, and the builder was told only `result.counts_look_right`;
// three revisions repeated the same read of one part. The read now reports
// whether its list continues (`listContinues`, two closed words admitted by
// `service/summaries/extraction-summary.ts`), the account carries it, and Core
// says it in plain words naming the read's step. The lists here are made up.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import type { AutomationStudioResultReadAccount } from "../../contracts/index.ts";
import { automationStudioResultReadAccounts } from "../accounts.ts";
import { automationStudioResultSummaryWithPagingWords } from "../judge-paging.ts";
import { automationStudioResultReadListContinues } from "../list-continues.ts";
import { automationStudioResultReadSentence } from "../sentence.ts";

/** One read of a recipe archive's first part: 5 items seen, 1 kept. */
function attempt(listContinues?: unknown): AutomationStudioFlowRunActionAttemptRecord {
  return {
    attemptId: "attempt.recipes",
    nodeId: "read.recipes",
    definitionId: "web.output.dom-extract_list",
    order: 3,
    status: "succeeded",
    startedAt: 10,
    metadata: { extraction: { recordCount: 1, pagesRead: 1, truncated: false, fieldNames: ["title"], missingFields: [], itemsSeen: 5, ...(listContinues === undefined ? {} : { listContinues }) } }
  } as AutomationStudioFlowRunActionAttemptRecord;
}

/** Core's words that a list going on past its own end, or past the range asked for, is not rows missing from that range. */
const RANGE = "Where it goes on past an end the page itself marks, or past the range the request asks for, what follows is not rows missing from that range: judge what was read against the request's own range.";

const read = (fields: Partial<AutomationStudioResultReadAccount> = {}): AutomationStudioResultReadAccount =>
  ({ nodeId: "read.recipes", definitionId: "web.output.dom-extract_list", pagesRead: 1, truncated: false, itemsSeen: 5, kept: 1, ...fields });

describe("a read whose list goes on past what it read", () => {
  it("carries the read's own fact on its account, and a read that sent none carries nothing", () => {
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [attempt({ kind: "infinite_scroll", evidence: "declared_feed" })] });
    expect(reads[0]).toMatchObject({ nodeId: "read.recipes", itemsSeen: 5, kept: 1, listContinues: { kind: "infinite_scroll", evidence: "declared_feed" } });
    const ended = automationStudioResultReadAccounts({ actionAttempts: [attempt()] }).reads[0]!;
    expect("listContinues" in ended).toBe(false);
  });

  it("leaves out a fact whose words are not closed words", () => {
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [attempt({ kind: "More recipes below", evidence: "declared_feed" })] });
    expect("listContinues" in reads[0]!).toBe(false);
  });

  it("is said in plain words naming the read's step, what it saw and kept, and how to read further", () => {
    const words = automationStudioResultReadListContinues(read({ listContinues: { kind: "infinite_scroll", evidence: "declared_feed" } }))!;
    expect(words.said).toBe(`Step read.recipes read one part of a list that goes on past it (the page marks it as a list that loads more as it is scrolled, and it was still growing when the read stopped revealing more of it): it saw 5 items and kept 1, and no item after those was read. ${RANGE}`);
    expect(words.fix).toContain("To read past what step read.recipes read, move that same list on to its next part (a scroll down it)");
    expect(words.fix).toContain("Where the request asks only for what its first part shows, or what was read already reaches an end the page itself marks or the end of the range the request asks for, leave the read as it is.");
    expect(automationStudioResultReadListContinues(read({ listContinues: { kind: "next_page", evidence: "following_page_number" } }))!.said).toContain("(the page shows a numbered page after the current one)");
    expect(automationStudioResultReadListContinues(read({ listContinues: { kind: "load_more", evidence: "load_more_control" } }))!.fix).toContain("(its load-more control)");
    expect(automationStudioResultReadListContinues(read({ listContinues: { kind: "infinite_scroll", evidence: "still_growing" } }))!.said).toContain("(it was still growing when the read stopped revealing more of it)");
  });

  it("says nothing of a read whose list ended, or of one that pages, which its paging account already says", () => {
    expect(automationStudioResultReadListContinues(read())).toBeUndefined();
    const fact = { kind: "next_page", evidence: "next_control" };
    expect(automationStudioResultReadListContinues(read({ listContinues: fact, paginates: true }))).toBeUndefined();
    expect(automationStudioResultReadListContinues(read({ listContinues: fact, pagesRead: 3 }))).toBeUndefined();
    expect(automationStudioResultReadListContinues(read({ listContinues: fact, keptPerPage: [1] }))).toBeUndefined();
  });
});

// Social rerun round 3 (`run-mvgoawg4-ed85dd5a`, 0141-0145, 0214-0218): a
// feed's read was told it "was still growing when the read stopped revealing
// more of it" -- true, since the list went on past its own end marker into
// units of another kind -- and judges read that as rows missing from the task's
// range, asking to page further. A list that grows as it is revealed now says
// that going on past an end the page marks, or past the request's range, is not
// rows missing from that range. A numbered or controlled next part says what it
// said: the page itself names that part, and the judges' prose says the same
// for every list (`../../../llm/diagnosis-instructions.ts`).
describe("a read whose list grows as it is revealed", () => {
  it("says that going on past an end the page marks, or past the request's range, is not rows missing from that range", () => {
    for (const fact of [{ kind: "infinite_scroll", evidence: "declared_feed" }, { kind: "infinite_scroll", evidence: "still_growing" }, { kind: "load_more", evidence: "still_growing" }, { kind: "infinite_scroll", evidence: "unknown" }]) {
      const said = automationStudioResultReadListContinues(read({ listContinues: fact }))!.said;
      expect(said.split(RANGE)).toHaveLength(2);
      expect(said.endsWith(`no item after those was read. ${RANGE}`)).toBe(true);
    }
  });

  it("says nothing more of a list whose next part the page names by a number or a control", () => {
    for (const fact of [{ kind: "next_page", evidence: "following_page_number" }, { kind: "next_page", evidence: "next_control" }, { kind: "load_more", evidence: "load_more_control" }]) {
      expect(automationStudioResultReadListContinues(read({ listContinues: fact }))!.said).not.toContain(RANGE);
    }
  });
});

// A list goes on, ends, or is paused by the site (t755, from t756's trace of a
// profile grid): a loader that answers the read's reveal with a notice to wait
// grew nothing, so the list read as ended. It now says it paused, never that it
// was still growing, and its fix line says to wait out the pause before each move.
describe("a read whose list's loader asked it to wait", () => {
  const paused = read({ listContinues: { kind: "infinite_scroll", evidence: "loader_asked_to_wait" } });

  it("says the list paused rather than ended, and never that it was still growing", () => {
    const words = automationStudioResultReadListContinues(paused)!;
    expect(words.said).toContain("(the page answered the read's reveal of its end with a notice to wait before it loads more, so the list paused there rather than ended)");
    expect(words.said).not.toContain("still growing");
    expect(words.fix).toContain("move that same list on to its next part (a scroll down it)");
    expect(words.fix).toContain("The page paused this list: before each move, wait as long as its notice asks, or press the retry control the notice offers once it shows, as a person would.");
  });

  it("is carried on the account as sent, and no other word gets the pause line", () => {
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [attempt({ kind: "infinite_scroll", evidence: "loader_asked_to_wait" })] });
    expect(reads[0]).toMatchObject({ listContinues: { kind: "infinite_scroll", evidence: "loader_asked_to_wait" } });
    for (const evidence of ["declared_feed", "still_growing", "load_more_control", "next_control"]) {
      expect(automationStudioResultReadListContinues(read({ listContinues: { kind: "infinite_scroll", evidence } }))!.fix).not.toContain("paused");
    }
  });
});
describe("the judges' words for a read whose list goes on", () => {
  const continuing = read({ paginates: false, listContinues: { kind: "infinite_scroll", evidence: "still_growing" } });
  const said = automationStudioResultReadListContinues(continuing)!.said;
  const judged = (account: AutomationStudioResultReadAccount) => (automationStudioResultSummaryWithPagingWords({
    schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 1, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [], flowShape: [], withheld: false, reads: [account]
  }).reads![0] as AutomationStudioResultReadAccount & { paging: string }).paging;

  it("say Core's same sentence after the read's paging words, as the builder's feedback does", () => {
    expect(judged(continuing)).toBe(`Read 1 page. ${said}`);
    expect(automationStudioResultReadSentence(continuing, "full")).toContain(said);
    expect(automationStudioResultReadSentence(continuing, "brief")).toContain("its list goes on past what it read");
  });

  it("say nothing more of a read whose list ended", () => {
    const ended = read({ paginates: false });
    expect(judged(ended)).toBe("Read 1 page.");
    expect(automationStudioResultReadSentence(ended, "full")).not.toContain("goes on past");
    expect(automationStudioResultReadSentence(ended, "brief")).not.toContain("goes on past");
  });
});
