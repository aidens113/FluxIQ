// @fluxiq-test-group real-sql
// A task's own humanness level across attempts, through the real service, the real engine and a scripted
// model: a task with no level takes the person's starting value when it is asked, a level it has is never
// replaced by one, and a later attempt's run of the saved Flow is handed the task's level over the starting
// value (`../run-attempt.ts`, `../flow-stage.ts`). Provider-free.
//
// The starting value is the generate request's `humanness`.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioGraphExecutionOptions } from "../../../../executor/index.ts";
import { laterAttempts, readLoans } from "../../tests/later-attempts.ts";

vi.setConfig({ testTimeout: 180_000 });

const given = vi.hoisted(() => ({ handed: [] as AutomationStudioGraphExecutionOptions[] }));
vi.mock("../../../../../../runtime/flow-authoring/bootstrap/verification/index.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../../../../runtime/flow-authoring/bootstrap/verification/index.ts")>();
  return {
    ...real,
    runAutomationStudioDetachedCandidate: (input: Parameters<typeof real.runAutomationStudioDetachedCandidate>[0]) => {
      given.handed.push(input.options as AutomationStudioGraphExecutionOptions);
      return real.runAutomationStudioDetachedCandidate(input);
    }
  };
});

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  given.handed.length = 0;
});

const firstAttempt = { script: [readLoans(), { kind: "complete", result: { summary: "Listed." } }] };

const levels = () => given.handed.map((options) => options.humanness);
const flowLevel = async (lane: Awaited<ReturnType<typeof laterAttempts>>, humanness: number) => {
  const flow = await lane.service.getFlow(lane.projectId, "flow.loans");
  await lane.service.saveFlow({ projectId: lane.projectId, flow: { ...flow, metadata: { ...(flow.metadata ?? {}), humanness } } } as Parameters<typeof lane.service.saveFlow>[0]);
};

describe("a task's own humanness level, through the generate path", () => {
  it("a new task stores the request's starting value, and one with its own level keeps it and runs at it", async () => {
    const lane = await laterAttempts(cleanups);
    const first = await lane.attempt({ ...firstAttempt, humanness: 70 });
    expect(first.answer.attempt).toMatchObject({ status: "achieved", path: "explore", ordinal: 1 });
    expect((await lane.kept())?.humanness).toBe(70);
    // As `update-task-settings` sets it.
    await lane.changeKept((current) => ({ ...current, humanness: 20 }));
    given.handed.length = 0;
    const second = await lane.attempt({ humanness: 90 });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 2 });
    expect((await lane.kept())?.humanness).toBe(20);
    expect(given.handed.length).toBeGreaterThan(0);
    expect(levels()).toEqual(given.handed.map(() => 20));
  });

  it("a stored 0 on the task beats the starting value", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt({ ...firstAttempt, humanness: 70 });
    await lane.changeKept((current) => ({ ...current, humanness: 0 }));
    given.handed.length = 0;
    await lane.attempt({ humanness: 90 });
    expect(given.handed.length).toBeGreaterThan(0);
    expect(levels()).toEqual(given.handed.map(() => 0));
  });

  it("the Flow's level is the run's when the task has none and the request gives no starting value (a given one is stored on the task first)", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(firstAttempt);
    expect(await lane.kept()).not.toHaveProperty("humanness");
    await flowLevel(lane, 50);
    given.handed.length = 0;
    const second = await lane.attempt({});
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(await lane.kept()).not.toHaveProperty("humanness");
    expect(given.handed.length).toBeGreaterThan(0);
    expect(levels()).toEqual(given.handed.map(() => 50));
  });

  it("a Flow's level beats the starting value: a task with no level stores nothing and follows the Flow", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(firstAttempt);
    await flowLevel(lane, 30);
    given.handed.length = 0;
    const second = await lane.attempt({ humanness: 70 });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(await lane.kept()).not.toHaveProperty("humanness");
    expect(given.handed.length).toBeGreaterThan(0);
    expect(levels()).toEqual(given.handed.map(() => 30));
    // The Flow changes later and the task follows it, until the task has a level of its own.
    await flowLevel(lane, 10);
    given.handed.length = 0;
    await lane.attempt({ humanness: 70 });
    expect(await lane.kept()).not.toHaveProperty("humanness");
    expect(levels()).toEqual(given.handed.map(() => 10));
  });

  it("a stored 0 on the Flow beats the starting value: nothing is stored and the run is at 0", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(firstAttempt);
    await flowLevel(lane, 0);
    given.handed.length = 0;
    await lane.attempt({ humanness: 70 });
    expect(await lane.kept()).not.toHaveProperty("humanness");
    expect(given.handed.length).toBeGreaterThan(0);
    expect(levels()).toEqual(given.handed.map(() => 0));
  });

  it("with only a starting value the run takes it and the task stores it; with none given the run has no level", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(firstAttempt);
    given.handed.length = 0;
    await lane.attempt({ humanness: 70 });
    expect((await lane.kept())?.humanness).toBe(70);
    expect(given.handed.length).toBeGreaterThan(0);
    expect(levels()).toEqual(given.handed.map(() => 70));
    await lane.changeKept((current) => {
      const { humanness: _removed, ...rest } = current;
      return rest;
    });
    given.handed.length = 0;
    const third = await lane.attempt({});
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(await lane.kept()).not.toHaveProperty("humanness");
    expect(given.handed.length).toBeGreaterThan(0);
    for (const options of given.handed) expect(options).not.toHaveProperty("humanness");
  });
});
