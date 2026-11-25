// D14 (t1036): a completion submitted when nothing that decides the verdict changed since a judged no is answered
// with that no and no judge call. The page's raw reading, read afresh each time and never shown to the judge, is
// no change (run-mwuxd2v9-33928ea3 0163 and 0182, run-mwv5m906-5e999159 0081); an act, a row, the result's declared
// output or the draft is.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import type { AutomationStudioFlowLessJudgement, AutomationStudioFlowLessSummary, AutomationStudioResultEndView } from "../../../../../../runtime/result-verification/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE, automationStudioAnswerFirstCompletionCheck, automationStudioAnswerFirstDecidingDigest } from "../index.ts";

const purse: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["purse"] = { keepBackForJudging: () => undefined };
const columns = [{ id: "title", label: "Title" }];
const act = (what: string): AutomationStudioAttemptAct => ({ what, where: "On the site", classes: ["modify_existing"], state: "landed" }) as AutomationStudioAttemptAct;

/** What the judge is shown of a summary here: the end view's state and none of the raw page reading beside it. */
const shown = (summary: AutomationStudioFlowLessSummary): JsonObject => ({
  question: "Is it what was asked?",
  trail: (summary.trail ?? []) as unknown as JsonObject[],
  rows: summary.rows?.rows ?? [],
  acts: summary.acts.map((each) => ({ what: each.what, state: each.state })),
  ...(summary.answerText ? { answerText: summary.answerText } : {}),
  endState: (summary.endView?.view as JsonObject | undefined)?.judgeState ?? null,
  ...(summary.resultEvidence ? { resultEvidence: summary.resultEvidence as unknown as JsonObject } : {})
});

function made(over: { rows?: () => JsonObject[]; acts?: () => AutomationStudioAttemptAct[]; page?: () => string; draft?: () => unknown; judge?: () => Promise<AutomationStudioFlowLessJudgement>; projected?: boolean } = {}) {
  const judge = vi.fn(over.judge ?? (async (): Promise<AutomationStudioFlowLessJudgement> => ({ verdict: "no", reason: "Not what was asked.", checkedWhat: "the list" })));
  const rows = over.rows ?? (() => [{ title: "Atlas" }]);
  const check = automationStudioAnswerFirstCompletionCheck({
    instructions: "List the books on loan",
    rows: async () => ({ datasetId: "dataset.1", totalRows: rows().length, truncated: false, columns, rows: rows() }),
    acts: over.acts ?? (() => []),
    readsRan: () => true,
    endView: async () => ({ view: { page: over.page?.() ?? "page", judgeState: { title: "Library" } } }) as AutomationStudioResultEndView,
    witnesses: () => ({}),
    ...(over.projected === false ? {} : { shown }),
    ...(over.draft ? { draft: over.draft } : {}),
    judge,
    purse,
    say: () => undefined
  });
  return { check, judge };
}

describe("a completion over nothing new since a judged no", () => {
  it("gets the stored no, its reasons and its code, with no judge call, though the page's raw reading was read afresh", async () => {
    let reading = 0;
    const { check, judge } = made({ page: () => `[t${(reading += 1)}] Library, scrolled ${reading}` });
    const first = await check.check({ summary: "Got it." });
    const again = await check.check({ summary: "Got it, again." });
    expect(judge).toHaveBeenCalledTimes(1);
    if (first.ok || again.ok) throw new Error("Both should have been refused.");
    expect(again.issueCodes).toEqual([AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE]);
    expect(again.feedback.instruction).toContain("Not what was asked.");
    expect(again.feedback.instruction).toContain("Only new evidence changes");
  });

  it("is judged again when the page's raw reading differs and the check was given no projection (the summary's own digest)", async () => {
    let reading = 0;
    const { check, judge } = made({ projected: false, page: () => `[t${(reading += 1)}]` });
    await check.check({ summary: "Got it." });
    await check.check({ summary: "Got it, again." });
    expect(judge).toHaveBeenCalledTimes(2);
  });

  it("is judged again once a lasting act landed", async () => {
    const acts: AutomationStudioAttemptAct[] = [];
    const { check, judge } = made({ acts: () => acts });
    await check.check({ summary: "Got it." });
    acts.push(act("Set as my store"));
    await check.check({ summary: "Got it." });
    expect(judge).toHaveBeenCalledTimes(2);
  });

  it("is judged again once a row is held that was not", async () => {
    let rows = [{ title: "Atlas" }];
    const { check, judge } = made({ rows: () => rows });
    await check.check({ summary: "Got it." });
    rows = [{ title: "Atlas" }, { title: "Birds" }];
    await check.check({ summary: "Got it." });
    expect(judge).toHaveBeenCalledTimes(2);
  });

  it("is judged again once the draft changed", async () => {
    let draft = ["read the list"];
    const { check, judge } = made({ draft: () => draft });
    await check.check({ summary: "Got it." });
    await check.check({ summary: "Got it." });
    expect(judge).toHaveBeenCalledTimes(1);
    draft = ["read the list", "set the order"];
    await check.check({ summary: "Got it." });
    expect(judge).toHaveBeenCalledTimes(2);
  });

  it("is judged again once the site's end state, as the judge is shown it, changed", async () => {
    let title = "Library";
    const judge = vi.fn(async (): Promise<AutomationStudioFlowLessJudgement> => ({ verdict: "no", reason: "No.", checkedWhat: "x" }));
    const check = automationStudioAnswerFirstCompletionCheck({
      instructions: "List the books on loan",
      rows: async () => ({ datasetId: "dataset.1", totalRows: 1, truncated: false, columns, rows: [{ title: "Atlas" }] }),
      acts: () => [],
      readsRan: () => true,
      endView: async () => ({ view: { page: "same", judgeState: { title } } }) as AutomationStudioResultEndView,
      witnesses: () => ({}),
      shown,
      judge,
      purse,
      say: () => undefined
    });
    await check.check({ summary: "Got it." });
    title = "Checkout";
    await check.check({ summary: "Got it." });
    expect(judge).toHaveBeenCalledTimes(2);
  });

  it("asks again, as before, after a judge reply that gave no answer: a check that did not answer refuses nothing", async () => {
    const replies: AutomationStudioFlowLessJudgement[] = [
      { verdict: "not_judged", reason: "The reply could not be read." },
      { verdict: "no", reason: "Not what was asked.", checkedWhat: "the list" }
    ];
    const { check, judge } = made({ judge: async () => replies.shift()! });
    const unread = await check.check({ summary: "Got it." });
    expect(unread.ok).toBe(false);
    const read = await check.check({ summary: "Got it." });
    const third = await check.check({ summary: "Got it." });
    expect(judge).toHaveBeenCalledTimes(2);
    if (read.ok || third.ok) throw new Error("Both should have been refused.");
    expect(read.issueCodes).not.toEqual([AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE]);
    expect(third.issueCodes).toEqual([AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE]);
  });
});

describe("the deciding digest", () => {
  const summary: AutomationStudioFlowLessSummary = { instructions: "x", acts: [] };
  it("ignores the key order of what the judge is shown and the framing around it", () => {
    const one = automationStudioAnswerFirstDecidingDigest({ summary, shown: () => ({ a: 1, b: { c: 2, d: 3 }, question: "q", trail: [1] }) });
    const other = automationStudioAnswerFirstDecidingDigest({ summary, shown: () => ({ b: { d: 3, c: 2 }, a: 1, question: "another", trail: [1, 2] }) });
    expect(one).toBe(other);
  });
  it("tells a different draft apart", () => {
    expect(automationStudioAnswerFirstDecidingDigest({ summary, draft: 1 })).not.toBe(automationStudioAnswerFirstDecidingDigest({ summary, draft: 2 }));
  });
});
