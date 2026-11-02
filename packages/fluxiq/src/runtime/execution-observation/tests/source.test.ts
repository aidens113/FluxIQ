import { describe, expect, it } from "vitest";
import type { ExecutionCallbackObservation, PreparedExecutionCallback } from "../index.ts";
import { observationFixture } from "./fixture.ts";

describe("actual callback observation", () => {
  it("persists before actual invocation and retains the original receiver and arguments", async () => {
    const f = await observationFixture();
    class Host {
      #value = 4;
      calls = 0;
      read(delta: number): number {
        this.calls++;
        return this.#value + delta;
      }
    }
    const host = new Host();
    f.source.manage({ receiver: host, callback: host.read, contract: "no_direct_effects" });
    const paused = f.store.pauseNext("enter");
    const preparing = f.source.prepare(f.observation, { receiver: host, callback: host.read });
    await paused.entered;
    expect(host.calls).toBe(0);
    paused.release();
    const prepared = await preparing;
    expect(await f.source.invoke(prepared, { receiver: host, callback: host.read, args: [3] })).toBe(7);
    expect(f.source.completion(prepared)).toBe("settled");
    expect(host.calls).toBe(1);
  });

  it("settles an original compute-only throw and preserves the original error", async () => {
    const f = await observationFixture();
    const error = new Error("pure computation unavailable");
    const host = { compute(): never { throw error; } };
    f.source.manage({ receiver: host, callback: host.compute, contract: "no_direct_effects" });
    const prepared = await f.source.prepare(f.observation, { receiver: host, callback: host.compute });
    await expect(f.source.invoke(prepared, { receiver: host, callback: host.compute, args: [] })).rejects.toBe(error);
    expect(f.source.completion(prepared)).toBe("settled");
    expect(f.store.events.at(-1)).toBe("finish");
  });

  it("does not certify an opaque act+throw or a forged unacted result", async () => {
    for (const throwing of [false, true]) {
      const f = await observationFixture();
      let commits = 0;
      const host = { act() {
        commits++;
        if (throwing) throw new Error("ack lost");
        return { failure: { effect: "unacted" }, retryAllowed: true };
      } };
      const prepared = await f.source.prepare(f.observation, { receiver: host, callback: host.act });
      const run = f.source.invoke(prepared, { receiver: host, callback: host.act, args: [] });
      if (throwing) await expect(run).rejects.toThrow("ack lost");
      else await expect(run).resolves.toHaveProperty("retryAllowed", true);
      expect(f.source.completion(prepared)).toBe(throwing ? "unknown" : "unverified");
      expect(commits).toBe(1);
      expect(f.store.rows.get(f.source.context(prepared).parent && f.authority.entryBridge.read(f.source.context(prepared).parent).row.entryId)?.closed).toBe(false);
      if (throwing) {
        await expect(f.source.prepare(f.observation, { receiver: host, callback: host.act })).rejects.toThrow("reservation_not_active");
        expect(commits).toBe(1);
      }
    }
  });

  it("pins the selected callback before await and rejects a different invoker or copied token", async () => {
    const f = await observationFixture();
    const host = { first: () => 1, second: () => 2 };
    f.source.manage({ receiver: host, callback: host.first, contract: "no_direct_effects" });
    const prepared = await f.source.prepare(f.observation, { receiver: host, callback: host.first });
    await expect(f.source.invoke(prepared, { receiver: host, callback: host.second, args: [] })).rejects.toThrow("invocation_mismatch");
    await expect(f.source.invoke({ ...prepared } as PreparedExecutionCallback, { receiver: host, callback: host.first, args: [] })).rejects.toThrow("foreign_invocation");
    await expect(f.source.prepare({ ...f.observation } as ExecutionCallbackObservation, { receiver: host, callback: host.first })).rejects.toThrow("foreign_binding");
    expect(await f.source.invoke(prepared, { receiver: host, callback: host.first, args: [] })).toBe(1);
    await expect(f.source.invoke(prepared, { receiver: host, callback: host.first, args: [] })).rejects.toThrow("invocation_mismatch");
  });

  it("passes both original fulfilled and rejected outcomes to the registered completion owner", async () => {
    const f = await observationFixture();
    const error = new Error("actual completed no-effect rejection");
    const host = { run(fail: boolean): number {
      if (fail) throw error;
      return 9;
    } };
    class CompletionOwner {
      #count = 0;
      seen: unknown[] = [];
      readonly receiver = host;
      readonly callback = host.run;
      readonly contract = "managed_direct_effects" as const;
      consumeCompletion(input: { invocation: object; outcome: { kind: "fulfilled"; value: number } | { kind: "rejected"; error: unknown } }) {
        this.#count++;
        this.seen.push(input.outcome);
        return { disposition: "unacted" as const, completionDigest: "actual.owner", assessmentDigest: `assessment.${this.#count}` };
      }
    }
    const owner = new CompletionOwner();
    f.source.manage(owner);
    for (const fail of [false, true]) {
      const prepared = await f.source.prepare(f.observation, { receiver: host, callback: host.run });
      const running = f.source.invoke(prepared, { receiver: host, callback: host.run, args: [fail] });
      if (fail) await expect(running).rejects.toBe(error);
      else await expect(running).resolves.toBe(9);
      expect(f.source.completion(prepared)).toBe("settled");
    }
    expect(owner.seen).toEqual([{ kind: "fulfilled", value: 9 }, { kind: "rejected", error }]);
  });

  it("keeps synchronous callbacks synchronous inside an already durable frame", async () => {
    const f = await observationFixture();
    let synchronous = false;
    let callbackObservation = f.observation;
    const host = { capture(): number {
      synchronous = true;
      return 2;
    } };
    const frame = { run() {
      const first = f.source.invokeSync(callbackObservation, { receiver: host, callback: host.capture, args: [] });
      return first + f.source.invokeSync(callbackObservation, { receiver: host, callback: host.capture, args: [] });
    } };
    f.source.manage({ receiver: frame, callback: frame.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
    const prepared = await f.source.prepare(f.observation, { receiver: frame, callback: frame.run });
    callbackObservation = f.source.forParent(f.source.context(prepared));
    expect(await f.source.invoke(prepared, { receiver: frame, callback: frame.run, args: [] })).toBe(4);
    expect(synchronous).toBe(true);
    expect(f.source.completion(prepared)).toBe("unverified");
  });

  it("allows repeated first-execution reads of one unsupported method while retaining unverified coverage", async () => {
    const f = await observationFixture();
    let reads = 0;
    const host = { read() { return ++reads; } };
    for (let expected = 1; expected <= 2; expected++) {
      const prepared = await f.source.prepare(f.observation, { receiver: host, callback: host.read });
      expect(await f.source.invoke(prepared, { receiver: host, callback: host.read, args: [] })).toBe(expected);
      expect(f.source.completion(prepared)).toBe("unverified");
    }
    expect(reads).toBe(2);
    expect([...f.store.rows.values()].every(row => !row.closed)).toBe(true);
  });

  it("surfaces a failed completion write to the original caller and awaited cleanup without sealing coverage", async () => {
    const f = await observationFixture();
    let calls = 0;
    const callback = () => ++calls;
    f.source.manage({ receiver: undefined, callback, contract: "no_direct_effects" });
    const prepared = await f.source.prepare(f.observation, { receiver: undefined, callback });
    const failure = f.store.failNext("finish");
    await expect(f.source.invoke(prepared, { receiver: undefined, callback, args: [] })).rejects.toBe(failure);
    await expect(f.source.flush()).rejects.toMatchObject({ errors: [failure] });
    await expect(f.source.prepare(f.observation, { receiver: undefined, callback })).rejects.toThrow("reservation_not_active");
    expect(calls).toBe(1);
    expect(f.source.completion(prepared)).toBe("unknown");
    expect([...f.store.rows.values()].every(row => !row.closed)).toBe(true);
  });

  it("permits only exact managed read-only methods while live work is pending, with no clearance", async () => {
    const f = await observationFixture();
    let commits = 0;
    const host = { read: () => "retained evidence", act() {
      commits++;
      throw new Error("unknown act");
    } };
    const lease = Object.freeze({});
    f.source.manage({ receiver: host, callback: host.read, binding: lease, contract: "no_direct_effects" });
    const prepared = await f.source.prepare(f.observation, { receiver: host, callback: host.act });
    await expect(f.source.invoke(prepared, { receiver: host, callback: host.act, args: [] })).rejects.toThrow("unknown act");
    const events = [...f.store.events];
    await expect(f.source.invokeReadOnly({ receiver: host, callback: host.read, binding: lease, args: [] })).resolves.toBe("retained evidence");
    await expect(f.source.invokeReadOnly({ receiver: host, callback: host.read, binding: { ...lease }, args: [] })).rejects.toThrow("readonly_contract_missing");
    await expect(f.source.invokeReadOnly({ receiver: host, callback: host.act, args: [] })).rejects.toThrow("readonly_contract_missing");
    expect(f.store.events).toEqual(events);
    expect(commits).toBe(1);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
  });
});
