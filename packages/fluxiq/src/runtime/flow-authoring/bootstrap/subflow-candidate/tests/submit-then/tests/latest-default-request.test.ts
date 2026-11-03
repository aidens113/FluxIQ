// A latest-default test is a different request after Core accepts a new
// revision, even if the target page stayed unchanged. The same revision still
// keeps the outer anti-loop guard.
import { describe, expect, it } from "vitest";
import { runBuilder, submitCall, twoSteps, type Entry } from "./then-fixture.ts";

const testCall = (callId: string, input = {}) => () => ({ kind: "tool_call", toolId: "core.test_subflow", callId, input });

describe("the latest-default test's request identity", () => {
  it("tests a repaired new revision on the same page instead of replaying the earlier failed empty-input call", async () => {
    const run = await runBuilder([
      submitCall("submit-1", twoSteps()), testCall("test-1"), testCall("premature"),
      submitCall("submit-2", twoSteps(".filter-fixed")), testCall("from", { from: "second" }), testCall("test-2")
    ], { fromStep: true, fixedState: true, trials: [{ verdict: "execution_failed" }, { verdict: "yes" }] });
    expect(run.outcome.loop.ok, JSON.stringify(run.outcome.loop)).toBe(true);
    expect(run.asked.map(request => request.proposal.revision)).toEqual([1, 2]);
    expect(run.answers.get("test-2")).toMatchObject({ revision: 2, verdict: "yes" });
    expect(run.decides()).toBe(6);
  });

  it("keeps an unchanged revision's identical test behind the anti-loop guard", async () => {
    const ended = (_evidence: readonly Entry[]) => ({ kind: "complete", result: { ended: "partial", reason: "The unchanged test was refused." } });
    const run = await runBuilder([submitCall("submit", twoSteps()), testCall("first"), testCall("again"), testCall("repeat"), ended], { fixedState: true, trials: [{ verdict: "no" }] });
    expect(run.outcome.loop.ok, JSON.stringify(run.outcome.loop)).toBe(true);
    expect(run.asked).toHaveLength(1);
    expect(run.seen.at(-1)?.some(entry => (entry.value as { code?: string }).code === "llm_evidence_loop.repeat_refused")).toBe(true);
  });
});
