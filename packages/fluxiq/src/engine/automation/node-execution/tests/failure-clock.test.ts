import { expect, it } from "vitest";
import { enteredAutomationFrameFixture } from "../../tests/observed-frame.ts";
import { automationStudioNodeAttemptFailure } from "../failure.ts";

it.each(["own", "inherited"] as const)("keeps the primary failure and prior timestamp when a %s diagnostic clock becomes an accessor", async placement => {
  const f = await enteredAutomationFrameFixture();
  let reads = 0;
  await f.run(async options => {
    const owner = placement === "own" ? options : {};
    if (placement === "inherited") Object.setPrototypeOf(options, owner);
    Object.defineProperty(owner, "now", { get() {
      reads++;
      return () => 999;
    } });
    const trace = automationStudioNodeAttemptFailure({ id: "one", definitionId: "example.act" }, new Error("primary action failed"), options, 1, 20, {});
    expect(trace).toMatchObject({ message: "primary action failed", startedAt: 20, finishedAt: 20 });
  });
  expect(reads).toBe(0);
  await f.pending();
});

it("keeps the primary error when the original diagnostic clock itself throws", async () => {
  const f = await enteredAutomationFrameFixture();
  await f.run(async options => {
    options.now = () => { throw new Error("secondary clock failed"); };
    const trace = automationStudioNodeAttemptFailure({ id: "one", definitionId: "example.act" }, new Error("primary action failed"), options, 1, 20, {});
    expect(trace).toMatchObject({ message: "primary action failed", finishedAt: 20 });
  });
  await f.pending();
});

it("never invokes a replacement native diagnostic clock", async () => {
  const f = await enteredAutomationFrameFixture();
  const descriptor = Object.getOwnPropertyDescriptor(Date, "now")!;
  let calls = 0;
  await f.run(async options => {
    let trace;
    try {
      Object.defineProperty(Date, "now", { configurable: true, value: () => {
        calls++;
        return 999;
      } });
      trace = automationStudioNodeAttemptFailure({ id: "one", definitionId: "example.act" }, new Error("primary action failed"), options, 1, 20, {});
    } finally { Object.defineProperty(Date, "now", descriptor); }
    expect(trace).toMatchObject({ message: "primary action failed", finishedAt: 20 });
  });
  expect(calls).toBe(0);
  await f.pending();
});

it("preserves an unobserved clock getter, private receiver, empty tuple and original thrown clock error", () => {
  const clockFailure = new Error("legacy clock failed");
  let reads = 0;
  class Options {
    #calls = 0;
    get now() {
      reads++;
      return function(this: Options, ...args: unknown[]): number {
        expect(args).toEqual([]);
        this.#calls++;
        throw clockFailure;
      };
    }
    get calls() { return this.#calls; }
  }
  const options = new Options();
  let caught: unknown;
  try {
    automationStudioNodeAttemptFailure({ id: "one", definitionId: "example.act" }, new Error("primary action failed"), options, 1, 20, {});
  } catch (error) { caught = error; }
  expect(caught).toBe(clockFailure);
  expect(reads).toBe(1);
  expect(options.calls).toBe(1);
});
