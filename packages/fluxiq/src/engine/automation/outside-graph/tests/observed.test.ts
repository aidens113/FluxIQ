import { expect, it, vi } from "vitest";
import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/runtime";
import { automationStudioDispatchWithNodeRetries } from "../index.ts";
import { automationObservationFixture } from "../../execution-admission/tests/fixture.ts";

it("persists before the outside-graph callback and records its original throw before any result reader", async () => {
  const f = await automationObservationFixture();
  let commits = 0;
  const error = new Error("outside acknowledgement lost");
  const read = vi.fn(() => ({ ok: true as const }));
  const input = { node: { id: "act", definitionId: "example.act" }, dispatch: async () => {
    commits++;
    expect(f.store.events.at(-1)).toBe("enter");
    throw error;
  }, read };
  const paused = f.store.pauseNext("enter");
  const running = automationStudioDispatchWithNodeRetries(input, f.observation);
  await paused.entered;
  expect(commits).toBe(0);
  paused.release();
  await expect(running).rejects.toBe(error);
  await expect(automationStudioDispatchWithNodeRetries(input, f.observation)).rejects.toThrow();
  expect(commits).toBe(1);
  expect(read).not.toHaveBeenCalled();
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});

it("does not turn a page-only not_landed answer into a second backend dispatch", async () => {
  const f = await automationObservationFixture();
  let commits = 0;
  const failure: AutomationStudioFailureRecord = { category: "ambiguous_or_unknown", code: "example.unknown", retryable: false, stage: "execution", effect: "ambiguous" };
  const checkEffect = vi.fn(async () => "not_landed" as const);
  const input = { node: { id: "act", definitionId: "example.act", metadata: { effect: "mutate" } }, dispatch: async () => {
    commits++;
    return { ok: false as const, failure };
  }, read: (value: { ok: false; failure: AutomationStudioFailureRecord }) => value, checkEffect, delay: async () => undefined };
  await expect(automationStudioDispatchWithNodeRetries(input, f.observation)).rejects.toThrow("unverified_backend_retry");
  expect(commits).toBe(1);
  expect(checkEffect).toHaveBeenCalledTimes(1);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});

it("preserves all four ordinary attempts for an original registered compute-only dispatch", async () => {
  const f = await automationObservationFixture();
  let calls = 0;
  const waits: number[] = [];
  type Answer = { ok: true } | { ok: false; failure: AutomationStudioFailureRecord };
  const input = { node: { id: "read", definitionId: "example.read" }, dispatch: async (): Promise<Answer> => {
    calls++;
    return calls === 4 ? { ok: true } : { ok: false, failure: { category: "target_not_found", code: "example.not_ready", retryable: true, stage: "target_resolution", effect: "unacted" } };
  }, read: (value: Answer) => value, delay: async (ms: number) => { waits.push(ms); } };
  f.engine.manage({ receiver: undefined, callback: input.dispatch, contract: "no_direct_effects" });
  f.engine.manage({ receiver: input, callback: input.read, contract: "no_direct_effects" });
  f.engine.manage({ receiver: undefined, callback: input.delay, contract: "no_direct_effects" });
  const result = await automationStudioDispatchWithNodeRetries(input, f.observation);
  expect(result.result).toEqual({ ok: true });
  expect(result.attempts).toBe(4);
  expect(calls).toBe(4);
  expect(waits).toEqual([250, 1_000, 2_000]);
  expect([...f.store.rows.values()].filter(row => row.row.sourceKey === "automation.engine").every(row => row.closed)).toBe(true);
});
