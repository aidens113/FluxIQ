// @fluxiq-test-group real-sql
// A task's own humanness level across attempts, through the real service, the real engine and a scripted
// model: a task with no level takes the person's starting value when it is asked, a level it has is never
// replaced by one, and a later attempt's run of the saved Flow is handed the task's level over the starting
// value (`../run-attempt.ts`, `../flow-stage.ts`). Provider-free.
//
// The generate path does not hand the attempt the request's starting value yet (`service.ts`, another
// lane's), so this hands it on as that path will: the attempt's input carries it as `humanness`.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioGraphExecutionOptions } from "../../../../executor/index.ts";
import { laterAttempts, readLoans } from "../../tests/later-attempts.ts";

vi.setConfig({ testTimeout: 180_000 });

const given = vi.hoisted(() => ({ startingValue: undefined as number | undefined, handed: [] as AutomationStudioGraphExecutionOptions[] }));
vi.mock("../../index.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../index.ts")>();
  return {
    ...real,
    runAutomationStudioAnswerFirstAttempt: (input: Parameters<typeof real.runAutomationStudioAnswerFirstAttempt>[0]) => real.runAutomationStudioAnswerFirstAttempt(given.startingValue === undefined ? input : { ...input, humanness: given.startingValue })
  };
});
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
  given.startingValue = undefined;
  given.handed.length = 0;
});

const firstAttempt = { script: [readLoans(), { kind: "complete", result: { summary: "Listed." } }] };

describe("a task's own humanness level", () => {
  it("a new task stores the person's starting value, and one with its own level keeps it and runs at it", async () => {
    const lane = await laterAttempts(cleanups);
    given.startingValue = 70;
    const first = await lane.attempt(firstAttempt);
    expect(first.answer.attempt).toMatchObject({ status: "achieved", path: "explore", ordinal: 1 });
    expect((await lane.kept())?.humanness).toBe(70);
    // As `update-task-settings` sets it.
    await lane.changeKept((current) => ({ ...current, humanness: 20 }));
    given.startingValue = 90;
    given.handed.length = 0;
    const second = await lane.attempt({});
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 2 });
    expect((await lane.kept())?.humanness).toBe(20);
    expect(given.handed.length).toBeGreaterThan(0);
    expect(given.handed.map((options) => options.humanness)).toEqual(given.handed.map(() => 20));
  });

  it("a task kept with no level takes the starting value at its next attempt, and with none given it has no level and its run none", async () => {
    const lane = await laterAttempts(cleanups);
    const first = await lane.attempt(firstAttempt);
    expect(first.answer.attempt).toMatchObject({ status: "achieved", ordinal: 1 });
    expect(await lane.kept()).not.toHaveProperty("humanness");
    given.startingValue = 70;
    given.handed.length = 0;
    const second = await lane.attempt({});
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 2 });
    expect((await lane.kept())?.humanness).toBe(70);
    expect(given.handed.map((options) => options.humanness)).toEqual(given.handed.map(() => 70));
    // With nothing given and the task's level removed, the run carries no level at all: today's path.
    await lane.changeKept((current) => {
      const { humanness: _removed, ...rest } = current;
      return rest;
    });
    given.startingValue = undefined;
    given.handed.length = 0;
    const third = await lane.attempt({});
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 3 });
    expect(await lane.kept()).not.toHaveProperty("humanness");
    expect(given.handed.length).toBeGreaterThan(0);
    for (const options of given.handed) expect(options).not.toHaveProperty("humanness");
  });
});
