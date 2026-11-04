// @fluxiq-test-group real-sql
// The only failure ending, its budget gone, in its two forms, and the one a saved draft cannot
// cost: the task's result is returned whether or not what it did could be written as a Flow.
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioLlmProviderError } from "../../../../../../../runtime/models/failures/index.ts";
import { complete, READ_LOANS, RENEW_CARD, runNode, scriptedAttempt } from "../../fake-library.ts";
import { expectEnded, expectPresses, expectReached, judgedNo, keptAttempt } from "../support.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

describe("a budget gone ends it, with the best result", () => {
  it("budget exhaustion by the purse ends budget_out with the best result and the draft", async () => {
    const attempt = await scriptedAttempt({
      instruction: "Renew the card and list every loan on my library account.",
      permittedConsequences: ["modify_existing"],
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.04 },
      resolver: { maxTotalEstimatedCostUsd: 0.5 },
      wrapProvider: (provider) => ({ ...provider, estimateCostUsd: () => 0.04 }),
      keepLooking: true,
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true })]
    }, cleanups);
    const answer = expectEnded(attempt, "budget_out");
    expect(answer.attempt.budget.usd).toBe(0.5);
    expect(answer.attempt.spend.usd).toBeGreaterThan(0);
    expect(answer.attempt.spend.usd).toBeLessThanOrEqual(0.5);
    expect(answer.result).toMatchObject({ kind: "rows", label: "unverified", timesChecked: 0 });
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(answer.result?.missingWhat).toMatch(/budget/u);
    expect(answer.result?.acts).toHaveLength(1);
    expectPresses(attempt, { card: 1 });
    expect(answer.candidateId).toMatch(/^candidate\./u);
  });

  it("an empty balance ends budget_out at once, with what it had, and asks nothing more", async () => {
    let asked = 0;
    let afterEmpty = 0;
    const attempt = await scriptedAttempt({
      wrapProvider: (provider) => ({
        ...provider,
        runTask: async (request, execution) => {
          if (request.taskKind === "evidence_tool_decision" && (asked += 1) >= 2) {
            afterEmpty += 1;
            throw new AutomationStudioLlmProviderError("llm.provider_balance_exhausted", "No balance.", false);
          }
          return await provider.runTask(request, execution);
        }
      }),
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.")]
    }, cleanups);
    const answer = expectEnded(attempt, "budget_out");
    expect(answer.result).toMatchObject({ kind: "rows", label: "unverified" });
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(afterEmpty).toBe(1);
    expect(answer.attempt.spend.usd).toBeGreaterThan(0);
    expect(attempt.said.some((line) => line.includes("Reached this task's budget"))).toBe(true);
  });

  it("a judge's no before the budget went is said on the result it kept", async () => {
    const attempt = await scriptedAttempt({
      judge: [judgedNo("Not confirmed.")],
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.04 },
      resolver: { maxTotalEstimatedCostUsd: 0.3 },
      wrapProvider: (provider) => ({ ...provider, estimateCostUsd: () => 0.04 }),
      keepLooking: true,
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.")]
    }, cleanups);
    const answer = expectEnded(attempt, "budget_out");
    expect(answer.result).toMatchObject({ kind: "rows", label: "refuted", timesChecked: 1 });
  });
});

describe("a draft that could not be assembled", () => {
  it("costs the draft and not the result: the result is returned, and it is said honestly", async () => {
    const attempt = await scriptedAttempt({
      // A call kept out of the draft: there is no step to assemble a Flow from.
      script: [runNode("read", READ_LOANS, {}, [], {}), complete("Listed.")]
    }, cleanups);
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(answer.candidateId).toBeUndefined();
    expect(attempt.said.some((line) => line.includes("The steps were not saved as a Flow"))).toBe(true);
    const kept = await keptAttempt(attempt.service, attempt.projectId, attempt.flowId);
    expect(kept?.attempt.status).toBe("achieved");
    expect(kept?.steps).toBeDefined();
    expect(kept?.candidateId).toBeUndefined();
  });
});
