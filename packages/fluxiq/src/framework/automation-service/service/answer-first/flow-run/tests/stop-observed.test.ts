// @fluxiq-test-group real-sql
// A stop on an unseen effect is told as the page is when the run hands over (`../../../../stop-observed.ts`, t1088;
// live kestrel run-mwz2jc4w, attempt 2: a bot check stood between the search and its results for longer than
// the effect check looked, the results came by themselves just after the stop, and the handoff said the page
// was where the step left it). On the real engine and the lending library, with a host whose page changes
// after the run has stopped. A shop's search is the same shape: a lasting press whose result comes late.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../../../../runtime/automation-host/index.ts";
import { automationStudioAnswerFirstFlowRun } from "../index.ts";
import { flowRunFixture, LOANS_OUTPUT, savedStep, type FlowRunFixture } from "../../tests/fake-library-engine.ts";
import { READ_LOANS, RENEW_CARD } from "../../tests/fake-library.ts";

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** What the build recorded for the third step: opaque to Core, as the host signed it. */
const EFFECT: JsonObject = { v: 1, added: ["card-renewed"] };

const STEPS = [
  savedStep(1, READ_LOANS, { recordOutput: LOANS_OUTPUT }, { label: "the list of loans" }),
  savedStep(2, READ_LOANS, { recordOutput: LOANS_OUTPUT }, { label: "the list again" }),
  savedStep(3, RENEW_CARD, {}, { consequences: ["modify_existing"], label: "Renew the card" }),
  savedStep(4, READ_LOANS, { recordOutput: LOANS_OUTPUT }, { label: "the list at the end" })
];

/**
 * A fixture whose third step's effect is not on the page while the run looks. `arrivesAfterStop` says whether it comes by itself
 * once the run has stopped: the run's trail is told what it did as the run returns, which is the moment the page changes here.
 */
async function stoppedAtThree(arrivesAfterStop: boolean): Promise<{ fixture: FlowRunFixture }> {
  let arrived = false;
  const host: AutomationStudioHostRuntimeBoundary = {
    capabilities: [],
    observeRouteState: () => {
      return { page: arrived ? { location: "https://shop.example/results?q=kestrel", title: "Results" } : { location: "https://shop.example/challenge", title: "Pardon the wait" } };
    },
    routeEffectSeen: () => (arrived ? "seen" : "not_seen"),
    routeEffectHolds: () => arrived
  };
  const fixture = await flowRunFixture({
    permittedConsequences: ["modify_existing"],
    engine: (engine) => ({ ...engine, graphOptions: (input) => ({ ...engine.graphOptions(input), hostRuntime: host, delay: async () => undefined }) })
  }, cleanups);
  fixture.ports.input.routing = { signaturesOf: (step) => "position" in step && step.position === 3 ? { effect: EFFECT } : undefined };
  fixture.ports.trail = { add: () => { if (arrivesAfterStop) arrived = true; } };
  return { fixture };
}

describe("a replay that stopped on an effect not yet seen", () => {
  it("goes on from the next step in the same attempt when the page shows the effect as the run hands over, and never presses again", async () => {
    const { fixture } = await stoppedAtThree(true);
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: STEPS, stepsDigest: "digest.saved" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
    if (outcome.kind !== "ran") return;
    expect(outcome.steps.map((step) => [step.position, step.ran])).toEqual([[1, "passed"], [2, "passed"], [3, "passed"], [4, "passed"]]);
    // The attempt records that it did.
    expect(outcome.steps[2]).toMatchObject({ happened: expect.stringMatching(/was there when the run stopped, so the run went on from the next step/u) });
    expect(outcome.failing).toBeUndefined();
    // The press landed once and was not made again; the fourth step ran, the first two once each before the stop.
    expect(fixture.target.library.renewals.card).toBe(1);
    expect(fixture.target.reads).toBe(3);
    expect(fixture.counts.arrived).toBe(true);
  });

  it("tells the page as it is when the effect is still not there, and goes on from nowhere", async () => {
    const { fixture } = await stoppedAtThree(false);
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: STEPS, stepsDigest: "digest.saved" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: false, failing: { position: 3, code: "core.step.effect_not_seen", pageNow: { page: "shop.example" } } });
    if (outcome.kind !== "ran") return;
    expect(outcome.steps.map((step) => step.ran)).toEqual(["passed", "passed", "failed", "not_reached"]);
    expect(fixture.target.library.renewals.card).toBe(1);
    expect(fixture.target.reads).toBe(2);
  });
});
