// @fluxiq-test-group real-sql
// The run's humanness reaches the saved Flow's run: from the generate request (the attempt
// input) when no caller set one, and not at all when nothing did. Seen as the engine's waits:
// above 0 the run holds still before each step's first arrival (`engine/automation/pacing/`).
import { afterEach, describe, expect, it, vi } from "vitest";
import { automationStudioAnswerFirstFlowRun } from "../index.ts";
import { flowRunFixture, renewEveryLoan, type FlowRunFixture } from "../../tests/fake-library-engine.ts";

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function waits(humanness: number | undefined): Promise<{ fixture: FlowRunFixture; delays: number[] }> {
  const delays: number[] = [];
  const fixture = await flowRunFixture({
    ...(humanness === undefined ? {} : { humanness }),
    engine: (engine) => ({ ...engine, graphOptions: (input) => ({ ...engine.graphOptions(input), humannessSeed: 7, delay: async (ms: number) => { delays.push(ms); } }) })
  }, cleanups);
  const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: renewEveryLoan(), stepsDigest: "digest.saved" });
  expect(outcome).toMatchObject({ kind: "ran" });
  return { fixture, delays };
}

describe("a saved Flow's run at the request's humanness", () => {
  it("adds no wait when the request set none", async () => {
    const plain = await waits(undefined);
    const zero = await waits(0);
    expect(zero.delays).toEqual(plain.delays);
  });

  it("holds still before each step's first arrival when the request set a level", async () => {
    const plain = await waits(undefined);
    const human = await waits(80);
    expect(human.delays.length).toBeGreaterThan(plain.delays.length);
    expect(human.delays.filter((ms) => ms > 0).length).toBeGreaterThan(0);
  });
});
