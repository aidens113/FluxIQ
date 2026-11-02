import { expect, it } from "vitest";
import { AutomationStudioBuildToolAuxiliaryCalls, AutomationStudioBuildToolFactories, invokeAutomationStudioBuildToolCallback, observeAutomationStudioBuildToolParkingPort } from "../index.ts";
import { automationStudioPersonNeededAsk, automationStudioPersonNeededAskDraft, type AutomationStudioParkingPort } from "../../../parking/index.ts";
import { AutomationStudioSiteResetObservation } from "../../../flow-bootstrap/reset-observation/index.ts";
import { buildToolFixture } from "./fixture.ts";

it("runs an original auxiliary during a pending backend, retains its series on reuse and refuses copied handles", async () => {
  let reads = 0;
  let backendCalls = 0;
  let auxiliary: object | undefined;
  const reader = { read() {
    reads += 1;
    return reads;
  } };
  const host = {
    async execute() {
      backendCalls += 1;
      if (!auxiliary) throw new Error("test.original_auxiliary_missing");
      return await AutomationStudioBuildToolAuxiliaryCalls.invoke(auxiliary, { receiver: reader, callback: reader.read, args: [] });
    }
  };
  const f = await buildToolFixture(undefined, callbacks => {
    callbacks.manage({ receiver: host, callback: host.execute, contract: "no_direct_effects" });
    callbacks.manage({ receiver: reader, callback: reader.read, contract: "no_direct_effects" });
  });
  const request = Object.freeze({});
  const frame = async () => {
    auxiliary = AutomationStudioBuildToolAuxiliaryCalls.create(request);
    expect(await invokeAutomationStudioBuildToolCallback(request, { receiver: host, callback: host.execute, args: [] })).toBe(1);
    expect(await AutomationStudioBuildToolAuxiliaryCalls.invoke(auxiliary, { receiver: reader, callback: reader.read, args: [] })).toBe(2);
    await expect(AutomationStudioBuildToolAuxiliaryCalls.invoke({ ...auxiliary }, { receiver: reader, callback: reader.read, args: [] })).rejects.toThrow("execution_observation.foreign_auxiliary_invocation");
    await expect(AutomationStudioBuildToolAuxiliaryCalls.invoke(JSON.parse(JSON.stringify(auxiliary)), { receiver: reader, callback: reader.read, args: [] })).rejects.toThrow("execution_observation.foreign_auxiliary_invocation");
    expect(() => f.observer.bindAuxiliary(request, {})).toThrow("execution_observation.foreign_auxiliary_invocation");
  };
  AutomationStudioBuildToolFactories.remember(frame, "frame");
  await f.observer.invoke({ receiver: undefined, callback: frame, args: [] }, request);
  expect(reads).toBe(2);
  expect(backendCalls).toBe(1);
  expect(f.issued).toHaveLength(1);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
});

it.each(["throw", "fulfilled"] as const)("retains an opaque auxiliary's actual %s outcome and blocks the same invocation before another write", async mode => {
  let writes = 0;
  const original = new Error("auxiliary write then missing acknowledgement");
  const port = {
    act() {
      writes += 1;
      if (mode === "throw") throw original;
      return { unacted: true };
    }
  };
  const f = await buildToolFixture();
  const request = Object.freeze({});
  const frame = async () => {
    const auxiliary = AutomationStudioBuildToolAuxiliaryCalls.create(request);
    const first = AutomationStudioBuildToolAuxiliaryCalls.invoke(auxiliary, { receiver: port, callback: port.act, args: [] });
    if (mode === "throw") await expect(first).rejects.toBe(original);
    else expect(await first).toEqual({ unacted: true });
    await expect(AutomationStudioBuildToolAuxiliaryCalls.invoke(auxiliary, { receiver: port, callback: port.act, args: [] })).rejects.toThrow();
    expect(writes).toBe(1);
  };
  AutomationStudioBuildToolFactories.remember(frame, "frame");
  await f.observer.invoke({ receiver: undefined, callback: frame, args: [] }, request);
  expect(writes).toBe(1);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
});

it("pins the original port functions, receiver and typed arguments before awaiting", async () => {
  const ask = automationStudioPersonNeededAsk({ ...automationStudioPersonNeededAskDraft({}), askId: "original.ask" }, { stage: "authoring" });
  const wait = Object.freeze({ expiresAtMs: 500 });
  class Port implements AutomationStudioParkingPort {
    #opens = 0;
    #answers = 0;
    counts() { return [this.#opens, this.#answers]; }
    open(actual: typeof ask) {
      expect(actual).toBe(ask);
      expect(AutomationStudioSiteResetObservation.of(this)).toBeUndefined();
      this.#opens += 1;
      this.awaitAnswer = async () => { throw new Error("replacement answer must not run"); };
    }
    async awaitAnswer(actual: typeof ask, actualWait: Parameters<NonNullable<AutomationStudioParkingPort["awaitAnswer"]>>[1]) {
      expect(actual).toBe(ask);
      expect(actualWait).toBe(wait);
      this.#answers += 1;
      return { askId: actual.askId, kind: "choice" as const, value: "person_done", answeredAt: 1, actorId: "person" };
    }
  }
  const port = new Port();
  const f = await buildToolFixture(undefined, callbacks => {
    callbacks.manage({ receiver: port, callback: port.open, contract: "no_direct_effects" });
    callbacks.manage({ receiver: port, callback: port.awaitAnswer, contract: "no_direct_effects" });
  });
  const request = {};
  const frame = async () => {
    const observed = observeAutomationStudioBuildToolParkingPort(request, port);
    port.open = () => { throw new Error("replacement open must not run"); };
    await observed.open(ask);
    expect(await observed.awaitAnswer?.(ask, wait)).toMatchObject({ value: "person_done" });
  };
  AutomationStudioBuildToolFactories.remember(frame, "frame");
  await f.observer.invoke({ receiver: undefined, callback: frame, args: [] }, request);
  expect(port.counts()).toEqual([1, 1]);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
});
