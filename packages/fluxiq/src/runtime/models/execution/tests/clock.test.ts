import { expect, it } from "vitest";
import { observationFixture } from "../../../execution-observation/tests/fixture.ts";
import { prepareObservedExecutionCallback } from "../../../execution-observation/index.ts";
import { ModelExecutionDefaults, modelExecutionClock, type ModelExecutionOptions } from "../index.ts";

it("keeps the original private clock receiver and live Core defaults under the actual frame", async () => {
  const f = await observationFixture();
  class Clock {
    #value = 3;
    now(): number { return this.#value++; }
  }
  const clock = new Clock();
  f.source.manage({ receiver: clock, callback: clock.now, contract: "no_direct_effects" });
  const execution: { observation?: ModelExecutionOptions["observation"] } = {};
  const now = modelExecutionClock(execution, clock.now, clock);
  const core = { run() {
    const before = ModelExecutionDefaults.now();
    const actual = [now(), now()];
    expect(ModelExecutionDefaults.now()).toBeGreaterThanOrEqual(before);
    return actual;
  } };
  f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
  execution.observation = owned.observation;
  await expect(owned.invoke()).resolves.toEqual([3, 4]);
  expect(owned.completion()).toBe("settled");
});

it("retains an unsupported clock's first value and prevents a repeated callback after its effect", async () => {
  const f = await observationFixture();
  let writes = 0;
  const execution: { observation?: ModelExecutionOptions["observation"] } = {};
  const now = modelExecutionClock(execution, () => ++writes);
  const core = { run() { return now(); } };
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
  execution.observation = owned.observation;
  await expect(owned.invoke()).resolves.toBe(1);
  expect(owned.completion()).not.toBe("settled");
  expect(() => now()).toThrow("frame_outcome_unknown");
  expect(writes).toBe(1);
});
