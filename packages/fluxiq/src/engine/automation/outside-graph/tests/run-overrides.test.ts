// A node run outside a graph run takes its attempts from the run (W3, t899, F1):
// exploration's single nodes, a domain's forward and test replays and its looks
// at the page all go through `automationStudioDispatchWithNodeRetries`, so a
// run's overrides frame must reach them, and two runs in one process must each
// get their own.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/runtime";
import type { AutomationStudioFlowNode } from "../../../../flows/executable/graph/index.ts";
import { runWithAutomationStudioRunOverrides, type AutomationStudioRunOverrides } from "../../../../runtime/run-overrides/index.ts";
import { automationStudioDispatchWithNodeRetries } from "../../index.ts";

type Answer = { ok: false; failure: AutomationStudioFailureRecord };

const read: AutomationStudioFlowNode = { id: "web.output.dom-extract", definitionId: "web.output.dom-extract", metadata: { effect: "observe" } };
const NOT_FOUND: AutomationStudioFailureRecord = { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" };

/** Lets other queued work run, so two runs' attempts interleave. */
const yieldTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Dispatches a node that never finds its target; counts the dispatches and records the waits. */
async function neverFound(): Promise<{ attempts: number; dispatched: number; waits: number[] }> {
  let dispatched = 0;
  const waits: number[] = [];
  const outcome = await automationStudioDispatchWithNodeRetries<Answer>({
    node: read,
    dispatch: async () => {
      dispatched += 1;
      await yieldTurn();
      return { ok: false, failure: NOT_FOUND };
    },
    read: (answer) => answer,
    delay: async (ms) => { waits.push(ms);
      await yieldTurn(); },
    now: () => 0
  });
  return { attempts: outcome.attempts, dispatched, waits };
}

const under = <T>(frame: AutomationStudioRunOverrides, fn: () => T): T => runWithAutomationStudioRunOverrides(frame, fn);

describe("a node run outside a graph run, under the run's attempts", () => {
  it("dispatches four times with no frame, as before", async () => {
    expect(await neverFound()).toEqual({ attempts: 4, dispatched: 4, waits: [250, 1_000, 2_000] });
  });

  it("gives two concurrent runs their own attempts, however their dispatches interleave", async () => {
    const [seven, five] = await Promise.all([under({ nodeAttempts: 7 }, neverFound), under({ nodeAttempts: 5 }, neverFound)]);
    expect(seven).toMatchObject({ attempts: 7, dispatched: 7 });
    expect(five).toMatchObject({ attempts: 5, dispatched: 5 });
  });

  it("never dispatches fewer than four times, whatever the frame asks", async () => {
    expect((await under({ nodeAttempts: 1 }, neverFound)).dispatched).toBe(4);
  });

  it("waits the run's own waits between attempts", async () => {
    expect((await under({ nodeAttempts: 5, retryWaits: { backoffMs: [10, 20] } }, neverFound)).waits).toEqual([10, 20, 20, 20]);
  });

  it("is not cut short by a waiting allowance sized for four attempts", async () => {
    // Ten attempts thirty seconds apart: the per-node allowance scales to 60 s x 9 / 3.
    const { dispatched, waits } = await under({ nodeAttempts: 10, retryWaits: { backoffMs: [30_000] } }, neverFound);
    expect(dispatched).toBe(10);
    // Six full waits spend the 180 s; the last three attempts are not waited on.
    expect(waits).toEqual(Array.from({ length: 6 }, () => 30_000));
  });
});
