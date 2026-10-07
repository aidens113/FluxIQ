// A re-author that finds the Flow already does what was asked ends saying so
// (W17, live run `run-muw5zv4m-52d83027`, Stage 6 cause 2): the post-run check
// refuted a correct cart, and the re-author spent 46 decisions trying to change
// step 9 because nothing let it conclude the Flow needed no change.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../../llm/index.ts";
import { automationStudioReauthorEndingWatch } from "../nothing-to-change.ts";

const REASON = "Step 10 chose 12 Double Rolls and step 11 raised the quantity to 2: the cart line reads 12 Double Rolls, Qty 2.";

/** A step carried from the stored Flow, as the re-author's draft is seeded with it. */
function carried(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `f${position}`, iteration: 0, callId: `seed.${position}`, toolId: "core.run_node", actionId: "web.dom.click", input: { target: `t${position}` }, effect: "mutate", effectApplied: true, disposition: "kept",
    ranWith: { target: `t${position}` }, ...overrides
  };
}

/** The Flow the refuted run ran: a cart built in eleven steps, seeded unchanged. */
const seed = (): AutomationStudioFlowDraftStep[] => Array.from({ length: 11 }, (_, index) => carried(index + 1));

describe("a re-author that completes its seeded draft unchanged", () => {
  it("ends the build at that completion: no test, no further decision, and the reason kept", async () => {
    const watch = automationStudioReauthorEndingWatch();
    const decide = vi.fn(async () => ({ kind: "complete", result: { summary: REASON } }));
    const executeTool = vi.fn(async (_call: { toolId: string }) => ({ seen: true }));
    // The build's completion check as the service wires it: the watch first, before anything is checked or tested.
    const checkCompletion = vi.fn(async (result: JsonObject, context: { steps: readonly AutomationStudioFlowDraftStep[] }) => {
      const ended = watch.completed({ seed: seed(), steps: context.steps, result });
      if (ended) throw ended;
      return { ok: true as const };
    });

    const run = runAutomationStudioLlmEvidenceLoop({
      tools: [{ toolId: "inspect", description: "Read the page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
      decide, executeTool, propagateDecisionErrors: true, maxIterations: 64, checkCompletion, fullRunRequired: true,
      unusableDecisions: { maxConsecutive: 3, stalled: () => new Error("stalled") },
      draft: { seed: seed() }
    });

    await expect(run).rejects.toMatchObject({ name: "AutomationStudioReauthorNothingToChangeEnding" });
    // One decision, the completion; nothing after it.
    expect(decide).toHaveBeenCalledTimes(1);
    expect(checkCompletion).toHaveBeenCalledTimes(1);
    // The Flow was not tested: the only tool call is the loop's first look.
    expect(executeTool.mock.calls.map(([call]) => call.toolId).filter((toolId) => toolId !== "inspect")).toEqual([]);
    expect(watch.said()).toEqual({ reason: REASON });
  });

  it("is the seed unchanged even where the model reran a carried step with the arguments it had", () => {
    const watch = automationStudioReauthorEndingWatch();
    // Live run muw5zv4m reran step 9 with its own arguments many times; the Flow is the same Flow.
    const rerun = seed().map((step) => step.position === 9 ? { ...step, id: "d40", callId: "c40", iteration: 40 } : step);
    expect(watch.completed({ seed: seed(), steps: rerun, result: { summary: REASON } })).toBeInstanceOf(Error);
    expect(watch.said()).toEqual({ reason: REASON });
  });
});

describe("a re-author that changed the Flow", () => {
  it("is not this ending: the completion goes on to be checked and tested as before", () => {
    const watch = automationStudioReauthorEndingWatch();
    const fixed = seed().map((step) => step.position === 9 ? { ...step, input: { target: "t-other" }, ranWith: { target: "t-other" } } : step);
    expect(watch.completed({ seed: seed(), steps: fixed, result: { summary: "Step 9 now opens the 12 Double Rolls listing." } })).toBeUndefined();
    expect(watch.said()).toBeUndefined();
  });

  it("is not this ending with no seed or nothing in the Flow", () => {
    const watch = automationStudioReauthorEndingWatch();
    expect(watch.completed({ seed: [], steps: seed(), result: { summary: REASON } })).toBeUndefined();
    expect(watch.completed({ seed: undefined, steps: seed(), result: { summary: REASON } })).toBeUndefined();
    expect(watch.completed({ seed: seed(), steps: [], result: { summary: REASON } })).toBeUndefined();
    expect(watch.said()).toBeUndefined();
  });
});

describe("the reason, screened like the brief's other text", () => {
  it("withholds a credential-shaped reason whole and still ends", () => {
    const watch = automationStudioReauthorEndingWatch();
    expect(watch.completed({ seed: seed(), steps: seed(), result: { summary: "Bearer sk-live-0123456789abcdef0123456789abcdef already did it" } })).toBeInstanceOf(Error);
    expect(watch.said()).toEqual({ reasonWithheld: true });
  });

  it("rewrites a locator inside the reason and says so", () => {
    const watch = automationStudioReauthorEndingWatch();
    watch.completed({ seed: seed(), steps: seed(), result: { summary: "Step 11 pressed #qty-plus > button.inc twice and the line reads Qty 2." } });
    const said = watch.said();
    expect(said?.reasonWithheld).toBe(true);
    expect(said?.reason).toBeDefined();
    expect(said?.reason).not.toContain("#qty-plus > button.inc");
  });
});
