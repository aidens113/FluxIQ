// A node run outside a graph run finds its stale target again through its
// caller (t786, design D7): the callback is asked once, before attempt 4, after
// a target lost without acting; `found` hands the remaining attempts a fresh
// dispatch, `gone` ends the node with the caller's answer, and anything else
// leaves the retries as they were.

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioDispatchWithNodeRetries, type AutomationStudioNodeRetryReacquire } from "../../index.ts";

type Answer = { ok: true; by: string } | { ok: false; by: string; failure: AutomationStudioFailureRecord };

const press: AutomationStudioFlowNode = { id: "press", definitionId: "web.output.dom-click" };
const NOT_FOUND: AutomationStudioFailureRecord = { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" };
const BUSY: AutomationStudioFailureRecord = { category: "action_failed", code: "web.action.rate_limited", retryable: true, stage: "execution", effect: "unacted" };

/** Always fails with `failure` on the stale dispatch; the fresh one, when a re-acquire hands it, succeeds. */
function run(reacquire: (asked: { failure: AutomationStudioFailureRecord; attempt: number }) => Promise<AutomationStudioNodeRetryReacquire<Answer>>, failure = NOT_FOUND) {
  const dispatched: string[] = [];
  const asked: { failure: AutomationStudioFailureRecord; attempt: number }[] = [];
  const outcome = automationStudioDispatchWithNodeRetries<Answer>({
    node: press,
    dispatch: async (attempt) => {
      dispatched.push(`stale.${attempt}`);
      return { ok: false, by: "stale", failure };
    },
    read: (answer) => (answer.ok ? { ok: true } : { ok: false, failure: answer.failure }),
    delay: async () => undefined,
    reacquire: async (input) => {
      asked.push({ failure: input.failure, attempt: input.attempt });
      return await reacquire(input);
    }
  });
  return { outcome, dispatched, asked };
}

describe("a stale target found again outside a graph run", () => {
  it("found: asked once before attempt 4, which runs on the fresh dispatch, four attempts in all", async () => {
    const fresh: string[] = [];
    const { outcome, dispatched, asked } = run(async () => ({
      outcome: "found",
      dispatch: async (attempt) => {
        fresh.push(`fresh.${attempt}`);
        return { ok: true, by: "fresh" };
      }
    }));
    const result = await outcome;
    expect(result).toMatchObject({ result: { ok: true, by: "fresh" }, attempts: 4, reacquire: "found" });
    expect(dispatched).toEqual(["stale.1", "stale.2", "stale.3"]);
    expect(fresh).toEqual(["fresh.4"]);
    expect(asked).toEqual([{ failure: NOT_FOUND, attempt: 4 }]);
  });

  it("gone: ends with the caller's answer, no fourth dispatch", async () => {
    const goneAnswer: Answer = { ok: false, by: "gone", failure: { ...NOT_FOUND, code: "executor.target.gone", retryable: false, effect: "unacted" } };
    const { outcome, dispatched, asked } = run(async () => ({ outcome: "gone", result: goneAnswer }));
    const result = await outcome;
    expect(result.result).toBe(goneAnswer);
    expect(result.attempts).toBe(3);
    expect(result.reacquire).toBe("gone");
    expect(dispatched).toEqual(["stale.1", "stale.2", "stale.3"]);
    expect(asked).toHaveLength(1);
  });

  it.each<["unmatched" | "unavailable" | "throws", "unmatched" | "unavailable"]>([["unmatched", "unmatched"], ["unavailable", "unavailable"], ["throws", "unavailable"]])("%s: attempt 4 runs on the old dispatch", async (answer, recorded) => {
    const { outcome, dispatched, asked } = run(async () => {
      if (answer === "throws") throw new Error("could not look again");
      return { outcome: answer };
    });
    const result = await outcome;
    expect(result).toMatchObject({ result: { ok: false, by: "stale" }, attempts: 4, reacquire: recorded });
    expect(dispatched).toEqual(["stale.1", "stale.2", "stale.3", "stale.4"]);
    expect(asked).toHaveLength(1);
  });

  it("is never asked for a failure that is not about the target, and the outcome carries no re-acquire", async () => {
    const { outcome, dispatched, asked } = run(async () => ({ outcome: "found", dispatch: async () => ({ ok: true, by: "fresh" }) }), BUSY);
    const result = await outcome;
    expect(asked).toEqual([]);
    expect(dispatched).toHaveLength(4);
    expect(result).not.toHaveProperty("reacquire");
  });

  it("is never asked when the target appears before attempt 4", async () => {
    const asked: number[] = [];
    const result = await automationStudioDispatchWithNodeRetries<Answer>({
      node: press,
      dispatch: async (attempt) => (attempt < 3 ? { ok: false, by: "stale", failure: NOT_FOUND } : { ok: true, by: "stale" }),
      read: (answer) => (answer.ok ? { ok: true } : { ok: false, failure: answer.failure }),
      delay: async () => undefined,
      reacquire: async (input) => {
        asked.push(input.attempt);
        return { outcome: "unmatched" };
      }
    });
    expect(result).toMatchObject({ result: { ok: true }, attempts: 3 });
    expect(asked).toEqual([]);
  });
});
