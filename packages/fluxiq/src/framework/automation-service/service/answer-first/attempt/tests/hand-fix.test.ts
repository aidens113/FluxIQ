// @fluxiq-test-group real-sql
// A saved Flow that breaks on the site as it stands, and a model that fixes it by hand instead of
// writing the step again: it presses the renamed control itself and puts that press in the Flow. Through
// the real service, the real engine, the real apply path and a scripted model, on a lending library
// that counts presses (none of the Lab's realistic scenarios). Provider-free.
//
// Pins two things the attempt used to get wrong. Its path said it explored, though the step the Flow
// broke at was repaired live from the page the run left (`../path.ts`). And the Flow it saved
// kept the broken press beside the fix, so every later attempt, and the person's Flow once adopted,
// broke at it again while the site stayed as it was (`../../flow-run/stand-in.ts`).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { appliedLane, changesOn, graphOf } from "../../apply-proven/tests/applied-lane.ts";
import { complete, RENEW_CARD } from "../../tests/fake-library.ts";
import { cardFirstAttempt, CARD_TASK, PERMITTED } from "../../tests/honest-attempts.ts";
import { toldTo } from "../../tests/later-attempts.ts";
import { ON_THE_CARD, pressCardByHand } from "../../tests/library-site.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const RENAMED = "Extend card";
const CARD_STEP = 2;
/** A person's Run again: the press that means do it again, with an empty act record. */
const pressedAgain = { instruction: CARD_TASK, ...PERMITTED, runAgain: true };
const controlOf = (step: { input: JsonObject }) => (step.input.parameters as JsonObject | undefined)?.control;

describe("a hand fix after a saved Flow broke", () => {
  it("is a repair, the Flow keeps the fix in the broken step's place and not the broken step, and the next attempt and the person's Flow run it whole", async () => {
    const { lane, target, site } = await appliedLane(cleanups);
    await lane.attempt(cardFirstAttempt());
    expect(target.library.renewals.card).toBe(1);
    site.cardControl = RENAMED;

    const second = await lane.attempt({ ...pressedAgain, script: [pressCardByHand("card.fix", RENAMED), complete("Renewed the card.")] });
    expect(toldTo(second.decisions[0])?.flowRun).toMatchObject({ stoppedAt: CARD_STEP });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_repair", ordinal: 2 });
    expect(second.answer.result).toMatchObject({ source: "both", label: "confirmed" });
    // Once this attempt: the broken press did nothing, and the hand press did it.
    expect(target.library.renewals.card).toBe(2);

    const kept = (await lane.kept(CARD_TASK))?.best;
    expect(kept?.attemptId).toBe(second.answer.attempt.attemptId);
    const inTheFlow = (kept?.steps ?? []).filter(automationStudioFlowDraftStepIsProposed);
    expect(inTheFlow.map((step) => [step.position, step.actionId, controlOf(step)])).toEqual([[CARD_STEP, RENEW_CARD, RENAMED]]);
    expect(kept?.steps.find((step) => controlOf(step) === ON_THE_CARD)).toMatchObject({ disposition: "dropped", replacedBy: inTheFlow[0]?.id });

    const third = await lane.attempt(pressedAgain);
    expect(third.decisions).toEqual([]);
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 3 });
    expect(target.library.renewals.card).toBe(3);
    // Proven whole, it is adopted into the person's Flow: one press, on the control as the site names it now.
    expect((await changesOn(lane)).map((change) => change.status)).toEqual(["applied"]);
    const presses = (await graphOf(lane))?.nodes.filter((node) => node.definitionId === RENEW_CARD) ?? [];
    expect(presses.map((node) => node.parameterValues?.control)).toEqual([RENAMED]);
  });

  it("left out of the Flow is no repair, and the Flow keeps the step it had", async () => {
    const { lane, target, site } = await appliedLane(cleanups);
    await lane.attempt(cardFirstAttempt());
    site.cardControl = RENAMED;
    const second = await lane.attempt({ ...pressedAgain, script: [pressCardByHand("card.fix", RENAMED, {}), complete("Renewed the card.")] });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_explore" });
    expect(target.library.renewals.card).toBe(2);
    const inTheFlow = ((await lane.kept(CARD_TASK))?.best?.steps ?? []).filter(automationStudioFlowDraftStepIsProposed);
    expect(inTheFlow.map((step) => controlOf(step))).toEqual([ON_THE_CARD]);
  });
});
