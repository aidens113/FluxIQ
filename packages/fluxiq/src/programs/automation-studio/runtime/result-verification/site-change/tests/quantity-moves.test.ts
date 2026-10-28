// A row's quantity move judged against the change asked (t775, user
// 2026-10-27): "if we previously had 9 items in cart from previous runs, the
// desired quantity is 1, and we test and the final result is 10 of that same
// item, then judge can deduce that it WAS successful without any reset".
// Through `../line-moves.ts`, `../witness-move.ts`, `../count-claim.ts` and
// `../count-differs.ts`, by the agreement and the refuted-no re-ask that use
// them. Test fixtures only: no model guidance is shaped by these words.
import { describe, expect, it, vi } from "vitest";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationReaskContradicted } from "../../agreement/index.ts";
import type { AutomationStudioTrialSiteChange } from "../../../flow-bootstrap/trial-change/index.ts";
import type { AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import type { AutomationStudioLlmDiagnosisFields } from "../../../llm/index.ts";
import { automationStudioResultNoRecord, automationStudioResultRefutedReading } from "../../refuted-no/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultChangeCountClaim, automationStudioResultChangeCountDiffers, automationStudioResultWitnessMove } from "../index.ts";
import { libraryHoldsSummary } from "./library-holds-fixture.ts";

const REQUEST = "Add one copy of Dune to the cart.";

/** A cart whose one changed line went from `gone` to `added`, for a part asking `direction` `count` copies of Dune. */
function cart(gone: string, added: string, effect: { direction: "adds" | "removes"; count: number | "each_match" } = { direction: "adds", count: 1 }, rows: { added?: number; removed?: number; changed?: number } = {}): AutomationStudioTrialSiteChange {
  return {
    witnesses: [{
      id: "w1", kind: "list", where: "Cart", steps: [2], parts: ["p1"],
      before: { source: "latest_read", rows: 3 }, after: { source: "core_look", rows: 3 },
      change: { added: rows.added ?? 0, removed: rows.removed ?? 0, changed: rows.changed ?? 1, unchanged: 2, lines: { gone: [gone], added: [added] } }
    }],
    acts: [{ step: 2, outcome: "changed", witness: "w1", parts: ["p1"] }],
    leftFromEarlier: [],
    proofs: [{ part: "p1", effect: { kind: "change", ...effect, what: "copy of Dune" }, proof: "shown", steps: [2] }]
  };
}

const summaryOf = (siteChange: AutomationStudioTrialSiteChange): AutomationStudioRunResultSummary => libraryHoldsSummary(siteChange);
const judged = (summary: AutomationStudioRunResultSummary, diagnosis: AutomationStudioLlmDiagnosisFields): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary, diagnosis, basis: "model" });
const yes = (summary: AutomationStudioRunResultSummary) => judged(summary, { answersRequest: "yes", observed: "One copy of Dune was added to the cart." });
const twoYeses = (summary: AutomationStudioRunResultSummary) =>
  automationStudioResultVerificationAgreement({ first: yes(summary), second: yes(summary), confirmAnswer: true, summary, requestText: REQUEST });

const TOTAL_NO: AutomationStudioLlmDiagnosisFields = {
  answersRequest: "no",
  expected: "One copy of Dune in the cart.",
  observed: "The cart has 10, the task asked for 1.",
  changed: "Add exactly one copy."
};

describe("a cart line at Qty 9 before the trial and Qty 10 after it, for a part adding 1", () => {
  const siteChange = cart("Dune — Qty 9", "Dune — Qty 10");
  const summary = summaryOf(siteChange);

  it("reads as a move of +1", () => {
    expect(automationStudioResultWitnessMove(siteChange.witnesses[0]!)).toMatchObject({ added: 0, removed: 0, total: 1, moves: [{ by: 1 }] });
    expect(automationStudioResultChangeCountDiffers(siteChange)).toEqual([]);
  });

  it("refutes a no saying the cart has 10 where the task asked for 1, with Core's change line", () => {
    const claim = automationStudioResultChangeCountClaim(TOTAL_NO.observed!, siteChange);
    expect(claim?.refuted).toBe(true);
    expect(claim?.finding).toContain('"Cart": no row added or removed; 1 row changed with only one whole number moved: "Dune — Qty 9" became "Dune — Qty 10" (+1); a move of +1 in all');
    expect(claim?.finding).toContain("which is the change it asks for (adds 1 copy of Dune)");
    const record = automationStudioResultNoRecord({ summary, requestText: REQUEST });
    expect(automationStudioResultRefutedReading({ observed: TOTAL_NO.observed!, advice: TOTAL_NO.changed! }, record)).toMatchObject({ wholly: true, findings: [claim!.finding] });
  });

  it("asks that no once more with the line; two yeses then stand as a yes", async () => {
    const settled = automationStudioResultVerificationAgreement({ first: judged(summary, TOTAL_NO), second: judged(summary, TOTAL_NO), confirmAnswer: true, summary, requestText: REQUEST });
    expect(settled.refutedNo).toMatchObject({ calls: [1, 2] });
    const ask = vi.fn(async () => yes(summary));
    const outcome = await automationStudioResultVerificationReaskContradicted({ first: judged(summary, TOTAL_NO), second: judged(summary, TOTAL_NO), confirmAnswer: true, summary, requestText: REQUEST, settled, ask });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(String((ask.mock.calls[0] as unknown[])[0])).toContain('"Dune — Qty 9" became "Dune — Qty 10" (+1)');
    expect(outcome).toMatchObject({ verdict: "answers", refutedNo: { reasked: true } });
    expect(twoYeses(summary)).toMatchObject({ verdict: "answers", basis: "model", calls: 2 });
  });
});

describe("a cart line at Qty 9 before the trial and Qty 11 after it, for a part adding 1", () => {
  const siteChange = cart("Dune — Qty 9", "Dune — Qty 11");

  it("holds two yeses: unsure, unconfirmed, the reason naming the part and the move read", () => {
    const agreed = twoYeses(summaryOf(siteChange));
    expect(agreed).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: "core.result.change_not_proven", verdicts: ["answers", "answers"], calls: 2 });
    expect(agreed.reason).toContain('part "p1" (moved other than asked: it adds 1 copy of Dune, and Core read at "Cart" no row added or removed; 1 row changed with only one whole number moved: "Dune — Qty 9" became "Dune — Qty 11" (+2); a move of +2 in all, a move of 2 where it asks for 1)');
    expect(agreed.repair).toBeUndefined();
  });

  it("does not refute a no over it", () => {
    expect(automationStudioResultChangeCountClaim("The cart has 11, the task asked for 1.", siteChange)).toBeUndefined();
  });
});

describe("a cart line whose quantity and total both moved", () => {
  const siteChange = cart("Dune — Qty 9 — 90.00 total", "Dune — Qty 10 — 100.00 total");

  it("gives no reading: the judge decides, neither a no refuted nor a yes held", () => {
    expect(automationStudioResultWitnessMove(siteChange.witnesses[0]!)).toBeUndefined();
    expect(automationStudioResultChangeCountClaim(TOTAL_NO.observed!, siteChange)).toBeUndefined();
    expect(automationStudioResultChangeCountDiffers(siteChange)).toEqual([]);
    expect(twoYeses(summaryOf(siteChange))).toMatchObject({ verdict: "answers", calls: 2 });
  });
});

describe("a cart line at Qty 5 before the trial and Qty 3 after it, for a part removing 2", () => {
  const siteChange = cart("Dune — Qty 5", "Dune — Qty 3", { direction: "removes", count: 2 });

  it("refutes a no saying the cart still has 3", () => {
    const claim = automationStudioResultChangeCountClaim("The cart still has 3 copies of Dune, but the task asked to remove 2 copies.", siteChange);
    expect(claim).toMatchObject({ refuted: true });
    expect(claim?.finding).toContain('"Dune — Qty 5" became "Dune — Qty 3" (-2); a move of -2 in all');
    expect(automationStudioResultChangeCountDiffers(siteChange)).toEqual([]);
    const record = automationStudioResultNoRecord({ summary: summaryOf(siteChange), requestText: "Remove two copies of Dune from the cart." });
    expect(automationStudioResultRefutedReading({ observed: "The cart still has 3 copies of Dune, but the task asked to remove 2 copies." }, record).wholly).toBe(true);
  });

  it("is held where it moved the other way", () => {
    expect(automationStudioResultChangeCountDiffers(cart("Dune — Qty 5", "Dune — Qty 7", { direction: "removes", count: 2 }))).toEqual([expect.objectContaining({ part: "p1" })]);
  });
});

describe("rows added and quantity moves together, and what is left to the judge", () => {
  it("sums rows added and quantity moves; a move against the asked direction is never matched", () => {
    const both = cart("Dune — Qty 9", "Dune — Qty 10", { direction: "adds", count: 2 }, { added: 1 });
    expect(automationStudioResultWitnessMove(both.witnesses[0]!)).toMatchObject({ total: 2 });
    expect(automationStudioResultChangeCountClaim("The cart has 11 items in all, but only 2 copies were asked for.", both)).toMatchObject({ refuted: true });
    const mixed = cart("Dune — Qty 9", "Dune — Qty 8", { direction: "adds", count: 1 }, { added: 2 });
    expect(automationStudioResultChangeCountClaim(TOTAL_NO.observed!, mixed)).toBeUndefined();
  });

  it("skips each_match, a control place, and a place another change part shares", () => {
    expect(automationStudioResultChangeCountDiffers(cart("Dune — Qty 9", "Dune — Qty 11", { direction: "adds", count: "each_match" }))).toEqual([]);
    const shared = cart("Dune — Qty 9", "Dune — Qty 11");
    shared.witnesses[0]!.parts.push("p2");
    shared.proofs.push({ part: "p2", effect: { kind: "change", direction: "adds", count: 1, what: "copy of Emma" }, proof: "shown", steps: [2] });
    expect(automationStudioResultChangeCountDiffers(shared)).toEqual([]);
  });

  it("holds no yes over rows added alone, which may hold more than one each: that count stays the judge's", () => {
    const newRows = cart("", "", { direction: "adds", count: 1 }, { added: 2, changed: 0 });
    newRows.witnesses[0]!.change = { added: 2, removed: 0, changed: 0, unchanged: 2, lines: { gone: [], added: [] } };
    expect(automationStudioResultChangeCountDiffers(newRows)).toEqual([]);
  });

  it("gives no reading where a changed row's lines are missing", () => {
    const unread = cart("Dune — Qty 9", "Dune — Qty 11", { direction: "adds", count: 1 }, { changed: 2 });
    expect(automationStudioResultWitnessMove(unread.witnesses[0]!)).toBeUndefined();
    expect(automationStudioResultChangeCountDiffers(unread)).toEqual([]);
  });
});
