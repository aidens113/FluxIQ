import { describe, expect, it } from "vitest";
import type { AutomationNodeExecutionResult } from "../../../../components/automation/index.ts";
import type { AutomationStudioNativeNodeContext } from "../../../../components/automation/importer/index.ts";
import { observedNativeResultCompletion } from "../index.ts";
import { nativeObservationFixture } from "./fixture.ts";

describe("native actual producer", () => {
  it("retains ordinary first invocation and keeps producer handles out of native context", async () => {
    let context: AutomationStudioNativeNodeContext | undefined;
    const f = await nativeObservationFixture(value => {
      context = value;
      return { outputs: { value: 7 } };
    });
    const result = await f.runtime.execute({ id: "n", definitionId: "example.native" }, {}, undefined, undefined, f.observation);
    expect(result?.result.outputs).toEqual({ value: 7 });
    expect(observedNativeResultCompletion(result!, f.parent)).toBe("unverified");
    expect(Object.keys(context!)).not.toContain("observation");
    expect(Object.keys(context!)).not.toContain("producer");
    expect(Object.keys(context!)).not.toContain("reservation");
  });

  it("observes synchronous act+throw before sanitization and prevents a second invocation", async () => {
    let commits = 0;
    const f = await nativeObservationFixture(() => {
      commits++;
      throw new Error("actual ack lost");
    });
    const node = { id: "n", definitionId: "example.native" };
    const first = await f.runtime.execute(node, {}, undefined, undefined, f.observation);
    expect(first?.result.outputs?.error).toBe("actual ack lost");
    expect(observedNativeResultCompletion(first!, f.parent)).toBe("unknown");
    await f.runtime.execute(node, {}, undefined, undefined, f.observation);
    expect(commits).toBe(1);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
    expect([...f.store.rows.values()].every(row => !row.closed)).toBe(true);
  });

  it("settles explicit compute-only original throws without changing legacy error/result behavior", async () => {
    let calls = 0;
    const f = await nativeObservationFixture(() => {
      calls++;
      throw new Error("temporarily unavailable");
    }, true);
    const node = { id: "n", definitionId: "example.native" };
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await f.runtime.execute(node, {}, undefined, undefined, f.observation);
      expect(result?.result.outputs?.error).toBe("temporarily unavailable");
      expect(observedNativeResultCompletion(result!, f.parent)).toBe("settled");
      expect(result?.result.failure?.effect).not.toBe("unacted");
    }
    expect(calls).toBe(2);
  });

  it("does not trust a forged unacted result from an unregistered ambient implementation", async () => {
    let commits = 0;
    const f = await nativeObservationFixture(() => {
      commits++;
      return { status: "failed", route: "failed", outputs: { value: 0 }, failure: { category: "action_failed", code: "forged", retryable: true, effect: "unacted" } };
    });
    const result = await f.runtime.execute({ id: "n", definitionId: "example.native" }, {}, undefined, undefined, f.observation);
    expect(commits).toBe(1);
    expect(observedNativeResultCompletion(result!, f.parent)).toBe("unverified");
    await f.runtime.execute({ id: "n", definitionId: "example.native" }, {}, undefined, undefined, f.observation);
    expect(commits).toBe(1);
  });

  it("keeps an abort-ignoring late callback pending and sends no second native invocation", async () => {
    let complete!: (value: AutomationNodeExecutionResult) => void;
    let started = 0;
    let commits = 0;
    const waiting = new Promise<AutomationNodeExecutionResult>(resolve => { complete = resolve; });
    const f = await nativeObservationFixture(async () => {
      started++;
      const value = await waiting;
      commits++;
      return value;
    });
    const node = { id: "n", definitionId: "example.native", metadata: { timeoutMs: 10 } };
    const first = await f.runtime.execute(node, {}, undefined, undefined, f.observation);
    expect(first?.result.outputs?.error).toContain("timeout");
    await f.runtime.execute(node, {}, undefined, undefined, f.observation);
    expect(started).toBe(1);
    complete({ outputs: { value: 1 } });
    await waiting;
    await Promise.resolve();
    await Promise.resolve();
    expect(commits).toBe(1);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
    expect([...f.store.rows.values()].every(row => !row.closed)).toBe(true);
  });
});
