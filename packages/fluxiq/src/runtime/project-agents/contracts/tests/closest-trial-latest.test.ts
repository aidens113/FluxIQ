// The trial a repair starts from, among trials of one verdict (t752): the
// latest, not the one that stored the most rows. A filtered request's trials
// can store a working read's rows beside the answer, so more rows is not closer
// to passing; a later trial is the builder's latest understanding. Only a latest
// trial that stored no answer rows gives way to an earlier one of its verdict
// that did.
import { describe, expect, it } from "vitest";
import { automationStudioProjectBuilderReturn as RETURN, type AutomationStudioProjectBuilderReturn, type AutomationStudioProjectTrialRef } from "../index.ts";

const trial = (n: number, verdict?: AutomationStudioProjectTrialRef["verdict"], rows?: number): AutomationStudioProjectTrialRef => ({
  kind: "subflow_trial", receiptId: `trial-${n}`, digest: String(n).repeat(64), ...(verdict ? { verdict } : {}), ...(rows !== undefined ? { rows } : {})
});
const returned = (trials: AutomationStudioProjectTrialRef[]): AutomationStudioProjectBuilderReturn => ({ briefId: "b1", outcome: "partial", reason: "r", trials, spentUsd: 0, calls: 1 });

describe("the closest trial among trials of one verdict", () => {
  it("is the latest, even where an earlier one stored more rows", () => {
    expect(RETURN.closestTrial([returned([trial(1, "no", 33), trial(2, "no", 30)])])?.receiptId).toBe("trial-2");
    expect(RETURN.closestTrial([returned([trial(1, "no", 33)]), returned([trial(2, "no", 30)])])?.receiptId).toBe("trial-2");
  });

  it("is the latest that stored answer rows where the latest stored none", () => {
    expect(RETURN.closestTrial([returned([trial(1, "no", 3), trial(2, "no", 0)])])?.receiptId).toBe("trial-1");
    expect(RETURN.closestTrial([returned([trial(1, "no", 2), trial(2, "no", 3), trial(3, "no", 0), trial(4, "no")])])?.receiptId).toBe("trial-2");
    // None stored any: the latest.
    expect(RETURN.closestTrial([returned([trial(1, "no", 0), trial(2, "no", 0)])])?.receiptId).toBe("trial-2");
  });

  it("keeps the verdict order: unsure still beats a later no", () => {
    expect(RETURN.closestTrial([returned([trial(1, "unsure", 1), trial(2, "no", 9)])])?.receiptId).toBe("trial-1");
    expect(RETURN.closestTrial([returned([trial(1, "no", 0), trial(2, "not_judged", 5), trial(3, "execution_failed", 7), trial(4)])])?.receiptId).toBe("trial-1");
  });

  it("ranks one trial strictly above another only by verdict, or by answer rows stored within a verdict", () => {
    expect(RETURN.trialAbove(trial(1, "no", 33), trial(2, "no", 30))).toBe(false);
    expect(RETURN.trialAbove(trial(2, "no", 30), trial(1, "no", 33))).toBe(false);
    expect(RETURN.trialAbove(trial(1, "no", 3), trial(2, "no", 0))).toBe(true);
    expect(RETURN.trialAbove(trial(1, "no", 3), trial(2, "no"))).toBe(true);
    expect(RETURN.trialAbove(trial(1, "unsure", 0), trial(2, "no", 9))).toBe(true);
  });
});
