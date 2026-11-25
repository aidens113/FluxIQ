// The judge's own view of a summary, as the deciding digest reads it (t1036): none without a privacy declaration,
// and, with the domain's projector, one that does not carry the page's raw reading.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowLessSummary } from "../../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstDecidingDigest, automationStudioAnswerFirstShownSummary } from "../index.ts";

const summaryOf = (page: string): AutomationStudioFlowLessSummary => ({
  instructions: "x",
  acts: [{ what: "Set as my store", where: "On the site", classes: ["modify_existing"], state: "landed" }] as unknown as AutomationStudioFlowLessSummary["acts"],
  endView: { view: { page, judgeState: { title: "Library" } } as JsonObject },
  witnesses: { after: { page, judgeState: { title: "Library" } } as JsonObject }
});

describe("what the judge is shown, for the deciding digest", () => {
  it("is nothing where no privacy declaration exists", () => {
    expect(automationStudioAnswerFirstShownSummary({})).toBeUndefined();
  });

  it("makes two readings of one site the same digest where the projector keeps only the semantic state, and a changed state another", () => {
    const projectJudgeEvidence = ((input: { evidence: unknown }) => {
      const view = input.evidence as { judgeState?: JsonObject; evidence?: { judgeState?: JsonObject } };
      const state = view.judgeState ?? view.evidence?.judgeState;
      return { role: "observation", evidence: state === undefined ? { captureOmitted: true } : { state, captureOmitted: true } };
    }) as unknown as NonNullable<Parameters<typeof automationStudioAnswerFirstShownSummary>[0]["projectJudgeEvidence"]>;
    const shown = automationStudioAnswerFirstShownSummary({ deniedEvidenceKeys: [], judgeEvidenceVersion: 1, projectJudgeEvidence })!;
    const digest = (summary: AutomationStudioFlowLessSummary) => automationStudioAnswerFirstDecidingDigest({ summary, shown });
    expect(digest(summaryOf("[t1] Library"))).toBe(digest(summaryOf("[t9] Library, scrolled")));
    const moved = summaryOf("[t1] Library");
    moved.endView = { view: { page: "[t1] Library", judgeState: { title: "Checkout" } } as JsonObject };
    expect(digest(moved)).not.toBe(digest(summaryOf("[t1] Library")));
  });
});
