// @fluxiq-test-group real-sql
// t963: a saved Flow's run hands every step the engine traced on to the attempt's trail, so the judge of the result it
// leaves sees what the run did (`../flow-run.ts`). On the real engine and store, with no model and no browser.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioResultTrailStep } from "../../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstFlowRun } from "../index.ts";
import { flowRunFixture, renewEveryLoan } from "../../tests/fake-library-engine.ts";

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

describe("a saved Flow's run, for the attempt's judge", () => {
  it("hands every step the engine traced on, in run order, each with what it ran with and how it ended", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const trail: AutomationStudioResultTrailStep[] = [];
    const outcome = await automationStudioAnswerFirstFlowRun({ ...fixture.ports, trail: { add: (steps) => { trail.push(...steps); } } }, { steps: renewEveryLoan(), stepsDigest: "digest.saved" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(trail.length).toBeGreaterThanOrEqual(2);
    for (const step of trail) {
      expect(step.did).toMatch(/\S/u);
      expect(step.outcome).toMatch(/\S/u);
    }
    // The read first, with the rows it stored (by the store's own reference: the rows themselves are the final data), then a renewal per row.
    expect(trail[0]).toMatchObject({ did: "domain.library.read_loans", on: "the list of loans", outcome: "succeeded, route success", found: { outputs: { records: { $dataset: { datasetId: "loans", recordCount: 3 } } } } });
    expect(trail.filter((step) => step.did === "domain.library.renew_loan").map((step) => step.outcome)).toEqual(["succeeded, route success", "succeeded, route success", "succeeded, route success"]);
  });

  it("hands nothing on, and runs as before, where the attempt gave no trail", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: renewEveryLoan(), stepsDigest: "digest.saved" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
  });
});
