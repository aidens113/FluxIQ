import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import {
  automationStudioHarnessOptionRegistry,
  type AutomationStudioLlmEvidenceTool
} from "../../../llm/index.ts";
import { resolveAutomationStudioExplorationBudget } from "../../exploration-budget.ts";
import { runAutomationStudioRuntimeExploration, type AutomationStudioRuntimeExploration } from "../../runtime-exploration.ts";
import { reviewAutomationStudioExplorationReduction } from "../reduction-review.ts";

// The two gaps Phase 2.5 exists to close, each asserted by the thing that goes
// wrong when it is not closed rather than by the field being present.
//
// The exploration below is written in the web domain's own words -- this is a
// test file, where naming a page and a control proves Core carried them
// opaquely. Every step returns *exactly the same evidence bytes*, which is the
// whole point: the runner already digests the evidence for the budget ledger's
// repeat check, and if that digest were what reached the record then both
// mutating steps would read as having changed nothing and the reduction would
// come back empty. The world did change, twice, and only the caller can say so.

const TOOLS: AutomationStudioLlmEvidenceTool[] = [
  { toolId: "test.inspect", description: "Observe the current state.", inputSchema: { type: "object" }, effect: "observe" },
  { toolId: "test.reveal", description: "Change the state to reveal what is hidden.", inputSchema: { type: "object" }, effect: "mutate" }
];

/** The same bytes every time, so nothing about the evidence can stand in for the state. */
const UNCHANGING_EVIDENCE = { page: "the same answer every time" };

/** What the world was at each moment, keyed `<callId>:<phase>`. */
const STATES: Record<string, string> = {
  "call.1:before": "state.listing",
  "call.1:after": "state.first-panel-open",
  "call.2:before": "state.first-panel-open",
  "call.2:after": "state.second-panel-open"
};

describe("the exploration's own step record", () => {
  // Mutation: record the evidence digest instead of the state digest. Both
  // steps return identical evidence, so an evidence digest makes
  // `stateBefore === stateAfter` and the reducer drops both as
  // `changed_nothing` -- a "minimum sequence" of nothing at all.
  it("records what the world was, not what the step said, so two steps that returned identical evidence still reduce to two actions", async () => {
    const run = await explore();

    expect(run.outcome).toBe("evidence_gathered");
    expect(run.steps.map((step) => [step.callId, step.stateBefore, step.stateAfter])).toEqual([
      ["call.1", "state.listing", "state.first-panel-open"],
      ["call.2", "state.first-panel-open", "state.second-panel-open"]
    ]);
    // And the evidence digest is emphatically not it: the bytes never changed.
    expect(run.steps.every((step) => step.stateBefore !== step.stateAfter)).toBe(true);

    const review = reduce(run);
    expect(review.replayable).toBe(true);
    expect(review.reduction?.actions.map((action) => action.actionId)).toEqual(["test.reveal", "test.reveal"]);
    expect(review.reduction?.dropped).toEqual([]);
  });

  // Mutation: drop the action input from the trace. The sequence still names
  // the two actions and nobody can run either of them, which is the defect the
  // input was added for -- so the assertion is on the argument surviving all
  // the way into the reduced sequence, not on the record having a field.
  it("carries the argument each action was given into the reduced sequence", async () => {
    const run = await explore();

    expect(run.steps.map((step) => step.input)).toEqual([{ target: "one" }, { target: "two" }]);
    expect(reduce(run).reduction?.actions).toEqual([
      { index: 0, actionId: "test.reveal", input: { target: "one" } },
      { index: 1, actionId: "test.reveal", input: { target: "two" } }
    ]);
  });

  // The record is one record, not two: every step points at the trace entry
  // that describes the same step, by the call id both carry.
  it("joins each recorded step to its own trace entry", async () => {
    const run = await explore();

    const traced = run.trace.filter((entry) => entry.decision === "tool_call" && entry.callId !== undefined);
    expect(run.steps.map((step) => ({ callId: step.callId, iteration: step.iteration })))
      .toEqual(traced.map((entry) => ({ callId: entry.callId, iteration: entry.iteration })));
  });

  // An exploration nobody could observe the state of is not reduced to an empty
  // fix. The reducer's honest answer to no steps at all -- "nothing is needed,
  // from any state" -- would read as a sequence that works.
  it("refuses to reduce an exploration whose state nothing observed", async () => {
    const run = await explore({ observeState: false });

    expect(run.observedState).toBe(false);
    expect(run.steps.map((step) => [step.stateBefore, step.stateAfter])).toEqual([[undefined, undefined], [undefined, undefined]]);
    const review = reduce(run);
    expect(review.replayable).toBe(false);
    expect(review.reduction).toBeUndefined();
    expect(review.reason.length).toBeGreaterThan(0);
  });

  // A digest that throws is bookkeeping failing, not the recovery failing. The
  // step still ran, is still recorded, and the doubt is reported rather than
  // becoming a state that silently stood still.
  it("lets a step stand when its digest throws, and reports the failure instead of guessing", async () => {
    const run = await explore({ throwAt: "call.2:after" });

    expect(run.outcome).toBe("evidence_gathered");
    expect(run.steps).toHaveLength(2);
    expect(run.steps[1]?.stateAfter).toBeUndefined();
    expect(run.stateDigestFailures).toEqual([
      { callId: "call.2", toolId: "test.reveal", phase: "after", reason: "Error: the page went away" }
    ]);
    const review = reduce(run);
    expect(review.replayable).toBe(false);
    // The completion turn is not an action and is not held against the answer;
    // the step whose state nobody could say is.
    expect(review.gaps).toEqual([
      { iteration: 2, actionId: "test.reveal", reason: "no_state_digests" },
      { iteration: 3, reason: "not_an_action" }
    ]);
  });
});

function reduce(run: AutomationStudioRuntimeExploration) {
  return reviewAutomationStudioExplorationReduction({
    trace: run.trace,
    tools: TOOLS,
    steps: run.steps,
    observedState: run.observedState,
    digestFailures: run.stateDigestFailures
  });
}

async function explore(options: { observeState?: boolean; throwAt?: string } = {}): Promise<AutomationStudioRuntimeExploration> {
  const decisions: JsonObject[] = [
    { kind: "tool_call", callId: "call.1", toolId: "test.reveal", input: { target: "one" } },
    { kind: "tool_call", callId: "call.2", toolId: "test.reveal", input: { target: "two" } },
    { kind: "complete", result: { findings: "The control is behind the second panel." } }
  ];
  let index = 0;
  const registry = automationStudioHarnessOptionRegistry({
    binding: {
      domainId: "test.domain",
      deniedEvidenceKeys: [],
      tools: TOOLS,
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: UNCHANGING_EVIDENCE, effectApplied: true })
    }
  });
  return await runAutomationStudioRuntimeExploration({
    loop: registry.evidenceLoopBinding({ projectId: "project.one", flowId: "flow.one" }, { scope: { kind: "global" }, allowSideEffectsWithoutPolicy: true }),
    decide: async () => decisions[index++] ?? { kind: "complete", result: {} },
    budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 60_000 }),
    ...(options.observeState === false ? {} : {
      captureStateDigest: async ({ callId, phase }) => {
        if (options.throwAt === `${callId}:${phase}`) throw new Error("the page went away");
        return STATES[`${callId}:${phase}`];
      }
    })
  });
}
