import { expect, it } from "vitest";
import { automationStudioAskEffect, type AutomationStudioAsk } from "../../../../runtime/parking/index.ts";
import { enteredAutomationFrameFixture } from "../../tests/observed-frame.ts";
import { automationStudioStepAskOrPark } from "../ask-or-park.ts";
import { stepPropertyContext } from "./property-context.ts";

it.each(["own", "inherited"] as const)("refuses a %s parking open getter without delivery", async placement => {
  const f = await enteredAutomationFrameFixture();
  let reads = 0;
  let calls = 0;
  await f.run(async options => {
    const owner = { open: (_ask: AutomationStudioAsk) => undefined };
    const port = placement === "own" ? owner : Object.create(owner) as typeof owner;
    Object.defineProperty(owner, "open", { get() {
      reads++;
      return () => { calls++; };
    } });
    options.parking = port;
    const { ctx, node, attempt } = stepPropertyContext(options);
    attempt.effects = [automationStudioAskEffect({ kind: "confirm", parks: true, text: "Continue?" })];
    try { await automationStudioStepAskOrPark(ctx, { node, attempt, attemptIndex: 0, stepIndex: 0, remainingMs: undefined }); }
    catch (error) { expect(error).toBeInstanceOf(Error); }
  });
  expect(reads).toBe(0);
  expect(calls).toBe(0);
  await f.pending();
});

it("rechecks the wait method after the original delivery yields", async () => {
  const f = await enteredAutomationFrameFixture();
  let reads = 0;
  let calls = 0;
  await f.run(async options => {
    const port = { open: async (_ask: AutomationStudioAsk) => {
      await Promise.resolve();
      Object.defineProperty(port, "awaitAnswer", { get() {
        reads++;
        return async () => {
          calls++;
          return undefined;
        };
      } });
    }, awaitAnswer: async (_ask: AutomationStudioAsk) => undefined };
    f.engine.manage({ receiver: port, callback: port.open, contract: "no_direct_effects" });
    options.parking = port;
    const { ctx, node, attempt } = stepPropertyContext(options);
    attempt.effects = [automationStudioAskEffect({ kind: "confirm", parks: true, text: "Continue?" })];
    await expect(automationStudioStepAskOrPark(ctx, { node, attempt, attemptIndex: 0, stepIndex: 0, remainingMs: undefined })).rejects.toThrow("callback_accessor_unsupported");
  });
  expect(reads).toBe(0);
  expect(calls).toBe(0);
  await f.pending();
});

it("preserves an original private parking receiver and exact question tuple", async () => {
  const f = await enteredAutomationFrameFixture();
  class Parking {
    #opened = 0;
    open(ask: AutomationStudioAsk) {
      expect(ask.text).toBe("Continue?");
      this.#opened++;
    }
    async awaitAnswer(ask: AutomationStudioAsk, input: { signal?: AbortSignal }) {
      expect(this.#opened).toBe(1);
      expect(input).toEqual({});
      return { askId: ask.askId, kind: "grant" as const, answeredAt: 2, value: null, actorId: null };
    }
  }
  const port = new Parking();
  f.engine.manage({ receiver: port, callback: port.open, contract: "no_direct_effects" });
  f.engine.manage({ receiver: port, callback: port.awaitAnswer, contract: "no_direct_effects" });
  await f.run(async options => {
    options.parking = port;
    options.now = () => 3;
    const { ctx, node, attempt } = stepPropertyContext(options);
    attempt.effects = [automationStudioAskEffect({ kind: "confirm", parks: true, text: "Continue?" })];
    expect(await automationStudioStepAskOrPark(ctx, { node, attempt, attemptIndex: 0, stepIndex: 0, remainingMs: undefined })).toMatchObject({ kind: "proceed" });
  });
});

it("refuses a replacement native timestamp after awaiting the original answer", async () => {
  const f = await enteredAutomationFrameFixture();
  const descriptor = Object.getOwnPropertyDescriptor(Date, "now")!;
  let calls = 0;
  await f.run(async options => {
    const port = { open: (_ask: AutomationStudioAsk) => undefined, awaitAnswer: async (ask: AutomationStudioAsk) => {
      await Promise.resolve();
      Object.defineProperty(Date, "now", { configurable: true, value: () => {
        calls++;
        return 9;
      } });
      return { askId: ask.askId, kind: "grant" as const, answeredAt: 2, value: null, actorId: null };
    } };
    f.engine.manage({ receiver: port, callback: port.open, contract: "no_direct_effects" });
    f.engine.manage({ receiver: port, callback: port.awaitAnswer, contract: "no_direct_effects" });
    options.parking = port;
    const { ctx, node, attempt } = stepPropertyContext(options);
    attempt.effects = [automationStudioAskEffect({ kind: "confirm", parks: true, text: "Continue?" })];
    let caught: unknown;
    try { await automationStudioStepAskOrPark(ctx, { node, attempt, attemptIndex: 0, stepIndex: 0, remainingMs: undefined }); }
    catch (error) { caught = error; }
    finally { Object.defineProperty(Date, "now", descriptor); }
    expect(caught).toBeInstanceOf(Error);
  });
  expect(calls).toBe(0);
  await f.pending();
});
