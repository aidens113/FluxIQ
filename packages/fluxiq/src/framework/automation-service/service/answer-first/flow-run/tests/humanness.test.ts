// @fluxiq-test-group real-sql
// The run's humanness reaches the saved Flow's run by precedence (`resolveHumanness`): a caller's
// own level, then the task's stored level, then the Flow's stored `metadata.humanness`, then the
// request's starting value, and not at all when nothing set one. Seen twice over: as the level the
// real engine is handed, and as its waits, since above 0 the run holds still before each step's
// first arrival (`engine/automation/pacing/`).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioGraphExecutionOptions } from "../../../../executor/index.ts";
import { automationStudioAnswerFirstFlowRun } from "../index.ts";
import { flowRunFixture, renewEveryLoan, type FlowRunFixture, type FlowRunFixtureOptions } from "../../tests/fake-library-engine.ts";

vi.setConfig({ testTimeout: 60_000 });

/** The options each real run is handed, so the resolved level and whether it is there at all are read, not inferred. */
const handed = vi.hoisted(() => [] as AutomationStudioGraphExecutionOptions[]);
vi.mock("../../../../../../runtime/flow-authoring/bootstrap/verification/index.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../../../../runtime/flow-authoring/bootstrap/verification/index.ts")>();
  return {
    ...real,
    runAutomationStudioDetachedCandidate: (input: Parameters<typeof real.runAutomationStudioDetachedCandidate>[0]) => {
      handed.push(input.options as AutomationStudioGraphExecutionOptions);
      return real.runAutomationStudioDetachedCandidate(input);
    }
  };
});

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

type Levels = Pick<FlowRunFixtureOptions, "humanness" | "callerHumanness" | "taskHumanness" | "flowHumanness">;

async function waits(levels: Levels): Promise<{ fixture: FlowRunFixture; delays: number[]; options: AutomationStudioGraphExecutionOptions }> {
  const delays: number[] = [];
  const fixture = await flowRunFixture({
    ...levels,
    engine: (engine) => ({ ...engine, graphOptions: (input) => ({ ...engine.graphOptions(input), humannessSeed: 7, delay: async (ms: number) => { delays.push(ms); } }) })
  }, cleanups);
  handed.length = 0;
  const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: renewEveryLoan(), stepsDigest: "digest.saved" });
  expect(outcome).toMatchObject({ kind: "ran" });
  expect(handed).toHaveLength(1);
  return { fixture, delays, options: handed[0]! };
}

const held = (delays: readonly number[]): number => delays.filter((ms) => ms > 0).length;

describe("a saved Flow's run at the request's humanness", () => {
  it("adds no wait when the request set none", async () => {
    const plain = await waits({});
    const zero = await waits({ humanness: 0 });
    expect(zero.delays).toEqual(plain.delays);
  });

  it("holds still before each step's first arrival when the request set a level", async () => {
    const plain = await waits({});
    const human = await waits({ humanness: 80 });
    expect(human.delays.length).toBeGreaterThan(plain.delays.length);
    expect(held(human.delays)).toBeGreaterThan(0);
  });
});

describe("the run's humanness by precedence", () => {
  it("takes an explicit run option over the task's, the Flow's and the starting value", async () => {
    const { options, delays } = await waits({ callerHumanness: 90, taskHumanness: 20, flowHumanness: 50, humanness: 70 });
    expect(options.humanness).toBe(90);
    expect(held(delays)).toBeGreaterThan(0);
  });

  it("takes the task's stored level over the Flow's and the starting value", async () => {
    const { options, delays } = await waits({ taskHumanness: 20, flowHumanness: 50, humanness: 70 });
    expect(options.humanness).toBe(20);
    expect(held(delays)).toBeGreaterThan(0);
  });

  it("takes the Flow's stored level over the starting value", async () => {
    const { options, delays } = await waits({ flowHumanness: 50, humanness: 70 });
    expect(options.humanness).toBe(50);
    expect(held(delays)).toBeGreaterThan(0);
  });

  it("takes the starting value when nothing is stored", async () => {
    const { options, delays } = await waits({ humanness: 70 });
    expect(options.humanness).toBe(70);
    expect(held(delays)).toBeGreaterThan(0);
  });

  it("gives no level and no wait when no source set one", async () => {
    const none = await waits({});
    expect(none.options).not.toHaveProperty("humanness");
    const zero = await waits({ humanness: 0 });
    expect(none.delays).toEqual(zero.delays);
    expect(held(none.delays)).toBe(held(zero.delays));
  });

  it("lets a stored 0 win over a starting value: the task's, and the Flow's", async () => {
    const none = await waits({});
    const task = await waits({ taskHumanness: 0, flowHumanness: 50, humanness: 70 });
    expect(task.options.humanness).toBe(0);
    expect(task.delays).toEqual(none.delays);
    const flow = await waits({ flowHumanness: 0, humanness: 70 });
    expect(flow.options.humanness).toBe(0);
    expect(flow.delays).toEqual(none.delays);
  });
});
