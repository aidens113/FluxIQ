// Which Flow a task keeps: every row of the design's table, and the digest the table compares.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstBetterFlow as better, automationStudioAnswerFirstStepsDigest as digest, type AutomationStudioAnswerFirstSavedFlow } from "../index.ts";

const step = (position: number, actionId: string, input: Record<string, unknown> = {}) => ({ position, actionId, input, iteration: 1, effect: "observe" }) as unknown as AutomationStudioFlowDraftStep;
/** A Flow whose draft assembled and was saved, as every row of the label table is: `steps` alone is one that never assembled. */
const flow = (attemptId: string, label: AutomationStudioAnswerFirstSavedFlow["label"], steps: AutomationStudioFlowDraftStep[], provenWhole = false): AutomationStudioAnswerFirstSavedFlow => ({
  ...stepsOnly(attemptId, label, steps, provenWhole), candidateId: `candidate.${attemptId}`
});
const stepsOnly = (attemptId: string, label: AutomationStudioAnswerFirstSavedFlow["label"], steps: AutomationStudioFlowDraftStep[], provenWhole = false): AutomationStudioAnswerFirstSavedFlow => ({
  attemptId, flowId: "flow.1", steps, stepsDigest: digest(steps), label, provenWhole, savedAtMs: 1, spend: { calls: 1, usd: 0.01 }
});
const A = [step(1, "open", { page: "desk" })];
const B = [step(1, "open", { page: "desk" }), step(2, "read", { list: "loans" })];
const calm = { flowFailedLive: false, wholeRunYes: false };

describe("which Flow is better", () => {
  it("keeps next where nothing was kept", () => {
    const next = flow("n", "unverified", A);
    expect(better(undefined, next, calm)).toBe(next);
  });
  it("keeps what it had where next has no steps", () => {
    const kept = flow("k", "confirmed", A);
    expect(better(kept, flow("n", "confirmed", []), calm)).toBe(kept);
    expect(better(undefined, flow("n", "confirmed", []), calm)).toBeUndefined();
  });
  it("keeps next with the same steps, proven whole when the whole run was judged yes", () => {
    const kept = flow("k", "confirmed", A, false);
    expect(better(kept, flow("n", "confirmed", A), { flowFailedLive: false, wholeRunYes: true })).toMatchObject({ attemptId: "n", provenWhole: true });
  });
  it("keeps the kept proven-whole value on the same steps when nothing changed it", () => {
    const kept = flow("k", "confirmed", A, true);
    expect(better(kept, flow("n", "confirmed", A, false), calm)).toMatchObject({ attemptId: "n", provenWhole: true });
    expect(better(flow("k", "confirmed", A, false), flow("n", "confirmed", A, true), calm)).toMatchObject({ provenWhole: false });
  });
  it("takes proven-whole away from a same-steps Flow that just failed live", () => {
    const kept = flow("k", "confirmed", A, true);
    expect(better(kept, flow("n", "unverified", A, true), { flowFailedLive: true, wholeRunYes: false })).toMatchObject({ attemptId: "n", provenWhole: false });
  });
  it("takes a confirmed Flow over one not confirmed, whatever its steps", () => {
    for (const label of ["unverified", "refuted"] as const) expect(better(flow("k", label, B), flow("n", "confirmed", A), calm)?.attemptId).toBe("n");
  });
  it("keeps a confirmed Flow over a confirmed one, unless the kept one just broke", () => {
    expect(better(flow("k", "confirmed", A), flow("n", "confirmed", B), calm)?.attemptId).toBe("k");
    expect(better(flow("k", "confirmed", A), flow("n", "confirmed", B), { flowFailedLive: true, wholeRunYes: false })?.attemptId).toBe("n");
  });
  it("keeps a confirmed Flow over one that is not", () => {
    for (const label of ["unverified", "refuted"] as const) {
      expect(better(flow("k", "confirmed", A), flow("n", label, B), calm)?.attemptId).toBe("k");
      expect(better(flow("k", "confirmed", A), flow("n", label, B), { flowFailedLive: true, wholeRunYes: false })?.attemptId).toBe("k");
    }
  });
  it("takes next where neither is confirmed: it was built from the best and went further", () => {
    for (const a of ["unverified", "refuted"] as const) for (const b of ["unverified", "refuted"] as const) expect(better(flow("k", a, A), flow("n", b, B), calm)?.attemptId).toBe("n");
  });
});

describe("a Flow that does not assemble", () => {
  const labels = ["confirmed", "unverified", "refuted"] as const;

  it("never wins over a next one that does, whatever the labels, and on a repair route that ran nothing", () => {
    // The live run's shape: a confirmed draft no Flow could be made of, then a confirmed repair of it that saved.
    for (const a of labels) for (const b of labels) {
      expect(better(stepsOnly("k", a, A), flow("n", b, B), calm)?.attemptId).toBe("n");
      expect(better(stepsOnly("k", a, A), flow("n", b, B), { ...calm, keptAssembles: false })?.attemptId).toBe("n");
    }
  });
  it("loses to the next one where the attempt found at its opening that the kept one does not assemble, even if it saved once", () => {
    expect(better(flow("k", "confirmed", A), flow("n", "confirmed", B), { ...calm, keptAssembles: false })?.attemptId).toBe("n");
  });
  it("never wins as the next one over a kept one that assembles", () => {
    for (const a of labels) for (const b of labels) {
      expect(better(flow("k", a, A), stepsOnly("n", b, B), calm)?.attemptId).toBe("k");
      expect(better(stepsOnly("k", a, A), stepsOnly("n", b, B), { ...calm, keptAssembles: true })?.attemptId).toBe("k");
    }
  });
  it("where neither assembles, takes the next one: it was built from the kept one and went further", () => {
    for (const a of labels) for (const b of labels) expect(better(stepsOnly("k", a, A), stepsOnly("n", b, B), calm)?.attemptId).toBe("n");
  });
  it("leaves the label table to decide between two that assemble", () => {
    expect(better(stepsOnly("k", "confirmed", A), flow("n", "confirmed", B), { ...calm, keptAssembles: true })?.attemptId).toBe("k");
    expect(better(stepsOnly("k", "unverified", A), flow("n", "confirmed", B), { ...calm, keptAssembles: true })?.attemptId).toBe("n");
  });
});

describe("the steps digest", () => {
  it("is the same for the same steps and does not depend on key order", () => {
    expect(digest([step(1, "open", { a: 1, b: { c: 2, d: [1, 2] } })])).toBe(digest([step(1, "open", { b: { d: [1, 2], c: 2 }, a: 1 })]));
  });
  it("ignores what is not position, action or input", () => {
    const one = { ...step(1, "open", { a: 1 }), iteration: 7, callId: "call.9" } as AutomationStudioFlowDraftStep;
    expect(digest([one])).toBe(digest([step(1, "open", { a: 1 })]));
  });
  it("differs on position, action or input", () => {
    const base = digest([step(1, "open", { a: 1 })]);
    expect(digest([step(2, "open", { a: 1 })])).not.toBe(base);
    expect(digest([step(1, "read", { a: 1 })])).not.toBe(base);
    expect(digest([step(1, "open", { a: 2 })])).not.toBe(base);
  });
});
