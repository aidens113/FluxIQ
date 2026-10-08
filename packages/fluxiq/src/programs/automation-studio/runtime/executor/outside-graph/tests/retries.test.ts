// A node run outside a graph run keeps the default retries (t355, the user's
// rule of 2026-10-07): the first attempt and three retries, each after the
// default's wait, and never a second act whose effect is uncertain.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY, automationStudioDispatchWithNodeRetries } from "../../index.ts";

type Answer = { ok: true } | { ok: false; failure?: AutomationStudioFailureRecord };

const press: AutomationStudioFlowNode = { id: "web.output.dom-click", definitionId: "web.output.dom-click", metadata: { effect: "mutate" } };
const read: AutomationStudioFlowNode = { id: "web.output.dom-extract", definitionId: "web.output.dom-extract", metadata: { effect: "observe" } };

const NOT_FOUND: AutomationStudioFailureRecord = { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" };
const BUSY: AutomationStudioFailureRecord = { category: "action_failed", code: "web.action.rate_limited", retryable: true, stage: "execution", effect: "unacted" };
const LOST_CONFIRMATION: AutomationStudioFailureRecord = { category: "output_not_observed", code: "web.validation.output_not_observed", retryable: true, stage: "verification" };
const AMBIGUOUS: AutomationStudioFailureRecord = { category: "action_failed", code: "web.action.failed", retryable: true, stage: "execution" };
const AMBIGUOUS_TARGET: AutomationStudioFailureRecord = { category: "target_ambiguous", code: "web.target.ambiguous", retryable: false, stage: "target_resolution" };

/** Answers `failures` in turn, then succeeds; records each dispatch and each wait. */
function scripted(failures: readonly (AutomationStudioFailureRecord | undefined)[], node: AutomationStudioFlowNode, signal?: AbortSignal) {
  const dispatched: number[] = [];
  const waits: number[] = [];
  let clock = 0;
  const run = automationStudioDispatchWithNodeRetries<Answer>({
    node,
    dispatch: async (attempt) => {
      dispatched.push(attempt);
      const failure = failures[attempt - 1];
      if (attempt <= failures.length) return failure ? { ok: false, failure } : { ok: false };
      return { ok: true };
    },
    read: (answer) => answer,
    delay: async (ms) => { waits.push(ms); clock += ms; },
    now: () => clock,
    ...(signal ? { signal } : {})
  });
  return { run, dispatched, waits };
}

describe("a node run outside a graph run, under the default retries", () => {
  it("pins the default to the first attempt and three retries", () => {
    expect(AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY.maxAttempts).toBe(4);
  });

  it("presses a target that appears before the third retry, and succeeds", async () => {
    const { run, dispatched, waits } = scripted([NOT_FOUND, NOT_FOUND, NOT_FOUND], press);
    const outcome = await run;
    expect(outcome.result).toEqual({ ok: true });
    expect(outcome.attempts).toBe(4);
    expect(dispatched).toEqual([1, 2, 3, 4]);
    expect(waits).toEqual([250, 1_000, 2_000]);
    expect(outcome.waitedMs).toBe(3_250);
    expect(outcome.faults.map((fault) => fault.disposition)).toEqual(["retry", "retry", "retry"]);
  });

  it("fails a target that never appears after exactly four attempts, with every attempt accounted for", async () => {
    const { run, dispatched } = scripted([NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND], press);
    const outcome = await run;
    expect(outcome.result).toEqual({ ok: false, failure: NOT_FOUND });
    expect(outcome.attempts).toBe(4);
    expect(dispatched).toEqual([1, 2, 3, 4]);
    expect(outcome.faults).toHaveLength(4);
    expect(outcome.faults.every((fault) => fault.code === "web.target.not_found")).toBe(true);
  });

  it("makes a press again after the page's busy refusal clears, because the page said the press never landed", async () => {
    const { run, dispatched } = scripted([BUSY], press);
    const outcome = await run;
    expect(outcome.result).toEqual({ ok: true });
    expect(outcome.attempts).toBe(2);
    expect(dispatched).toEqual([1, 2]);
  });

  it("never repeats a press whose failure was found after it acted, or whose effect is unknown", async () => {
    for (const failure of [LOST_CONFIRMATION, AMBIGUOUS]) {
      const { run, dispatched } = scripted([failure], press);
      const outcome = await run;
      expect(outcome.attempts).toBe(1);
      expect(dispatched).toEqual([1]);
      expect(outcome.faults[0]?.disposition).toBe("refuse");
    }
  });

  it("reads again after a lost confirmation, because reading twice acts on nothing", async () => {
    const { run } = scripted([LOST_CONFIRMATION, LOST_CONFIRMATION], read);
    const outcome = await run;
    expect(outcome.result).toEqual({ ok: true });
    expect(outcome.attempts).toBe(3);
  });

  it("answers a fault the producer says waiting cannot change, and a failure with no record, at once", async () => {
    const ambiguous = await scripted([AMBIGUOUS_TARGET], press).run;
    expect(ambiguous.attempts).toBe(1);
    const unrecorded = await scripted([undefined], press).run;
    expect(unrecorded.attempts).toBe(1);
    expect(unrecorded.faults).toEqual([]);
  });

  it("honours the wait a page names, bounded as the graph executor bounds it", async () => {
    const { run, waits } = scripted([{ ...BUSY, retryAfterMs: 4_000 }], press);
    await run;
    expect(waits).toEqual([4_000]);
  });

  it("dispatches nothing more once the build is cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const { run, dispatched } = scripted([NOT_FOUND, NOT_FOUND], press, controller.signal);
    const outcome = await run;
    expect(dispatched).toEqual([1]);
    expect(outcome.result).toEqual({ ok: false, failure: NOT_FOUND });
  });
});

// t359: a lasting act is retried only when its failure shows it did not
// happen, settled by the caller's effect check when there is one, and
// otherwise ends uncertain without a second act.
describe("a lasting act run outside a graph run", () => {
  /** A press as exploration describes it, and one whose step declared a lasting consequence and nothing else. */
  const declared: AutomationStudioFlowNode = { id: "add", definitionId: "web.output.dom-click", metadata: { declaredConsequences: ["create_new"] } };
  const declaredNone: AutomationStudioFlowNode = { id: "open", definitionId: "web.output.dom-click", metadata: { declaredConsequences: [] } };

  /** As `scripted`, with an effect check that answers `verdict` and records when it was asked. */
  function checked(failures: readonly AutomationStudioFailureRecord[], node: AutomationStudioFlowNode, verdict?: "landed" | "not_landed" | "unknown") {
    const dispatched: number[] = [];
    const asked: number[] = [];
    const run = automationStudioDispatchWithNodeRetries<Answer>({
      node,
      dispatch: async (attempt) => {
        dispatched.push(attempt);
        const failure = failures[attempt - 1];
        return failure ? { ok: false, failure } : { ok: true };
      },
      read: (answer) => answer,
      delay: async () => {},
      ...(verdict ? { checkEffect: async (_result: Answer, attempt: number) => { asked.push(attempt); return verdict; } } : {})
    });
    return { run, dispatched, asked };
  }

  it("is made again when it failed before it was dispatched, and succeeds", async () => {
    for (const node of [press, declared]) {
      const { run, dispatched, asked } = checked([NOT_FOUND, BUSY], node, "landed");
      const outcome = await run;
      expect(outcome.result).toEqual({ ok: true });
      expect(dispatched).toEqual([1, 2, 3]);
      expect(asked).toEqual([]);
      expect(outcome.lastingAct).toBeUndefined();
    }
  });

  it("is not made again when it failed after dispatch and the effect check shows it landed, and counts as done", async () => {
    for (const failure of [AMBIGUOUS, LOST_CONFIRMATION]) {
      const { run, dispatched, asked } = checked([failure], declared, "landed");
      const outcome = await run;
      expect(dispatched).toEqual([1]);
      expect(asked).toEqual([1]);
      expect(outcome.lastingAct).toBe("landed");
    }
  });

  it("is made again only once the effect check shows it did not land", async () => {
    const { run, dispatched, asked } = checked([AMBIGUOUS], press, "not_landed");
    const outcome = await run;
    expect(outcome.result).toEqual({ ok: true });
    expect(dispatched).toEqual([1, 2]);
    expect(asked).toEqual([1]);
    expect(outcome.faults[0]).toMatchObject({ disposition: "retry", effect: "unacted" });
    expect(outcome.faults[0]?.actUncertain).toBeUndefined();
  });

  it("ends uncertain without a second act when its effect cannot be determined", async () => {
    for (const [node, verdict] of [[declared, "unknown"], [declared, undefined], [press, undefined]] as const) {
      const { run, dispatched } = checked([AMBIGUOUS, AMBIGUOUS], node, verdict);
      const outcome = await run;
      expect(dispatched).toEqual([1]);
      expect(outcome.lastingAct).toBe("uncertain");
      expect(outcome.faults[0]).toMatchObject({ disposition: "refuse", actUncertain: true });
    }
  });

  it("takes the producer's word that the act was made, when the node itself declares nothing", async () => {
    const undeclared: AutomationStudioFlowNode = { id: "send", definitionId: "web.output.dom-click" };
    const { run, dispatched } = checked([{ ...AMBIGUOUS, effect: "ambiguous" }], undeclared);
    const outcome = await run;
    expect(dispatched).toEqual([1]);
    expect(outcome.lastingAct).toBe("uncertain");
  });

  it("leaves a node whose act does not last with the first attempt and three retries", async () => {
    const { run, dispatched, asked } = checked([AMBIGUOUS, AMBIGUOUS, AMBIGUOUS, AMBIGUOUS], declaredNone, "landed");
    const outcome = await run;
    expect(dispatched).toEqual([1, 2, 3, 4]);
    expect(asked).toEqual([]);
    expect(outcome.lastingAct).toBeUndefined();
    expect(outcome.faults.map((fault) => fault.disposition)).toEqual(["retry", "retry", "retry", "retry"]);
  });
});
