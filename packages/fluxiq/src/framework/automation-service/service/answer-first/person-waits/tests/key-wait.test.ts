// An attempt's waits on a locked key are its own (`../key-wait.ts`): what its limits leave out is
// what its own provider waited, so another person's wait on the same Flow lends it nothing.

import { expect, it } from "vitest";
import { automationStudioPersonWaitClock } from "../../../../../../runtime/models/secrets/index.ts";
import type { AutomationStudioLlmProvider } from "../../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstWatchKeyWaits } from "../key-wait.ts";

function watched(waitingFor?: string) {
  const listeners = new Set<(state: "started" | "ended", heldMs: number) => void>();
  const provider = { metadata: { provider: "mock", model: "m" }, runTask: async () => ({}), observeHolds: (listener: (state: "started" | "ended", heldMs: number) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  } } as unknown as AutomationStudioLlmProvider;
  const run = { waitingFor, waitedMs: 0 };
  let clock = 1_000;
  const kept: (string | undefined)[] = [];
  const watch = automationStudioAnswerFirstWatchKeyWaits({ run, provider, keep: () => kept.push(run.waitingFor), now: () => clock });
  const tell = (state: "started" | "ended") => listeners.forEach((listener) => listener(state, 0));
  return { run, watch, tell, kept, listeners, pass: (ms: number) => { clock += ms; } };
}

it("says what it waits for while its own provider waits, and counts that time, in progress too", () => {
  const { run, watch, tell, kept, pass } = watched();
  tell("started");
  expect(run.waitingFor).toBe("model_key_locked");
  pass(500);
  expect(watch.heldMs()).toBe(500);
  tell("ended");
  expect(run.waitingFor).toBeUndefined();
  expect(run.waitedMs).toBe(500);
  expect(kept).toEqual(["model_key_locked", undefined]);
});

it("does not take over another wait's words", () => {
  const { run, tell, kept } = watched("permission");
  tell("started");
  tell("ended");
  expect(run.waitingFor).toBe("permission");
  expect(kept).toEqual([]);
});

it("treats overlapping calls as one stretch", () => {
  const { watch, tell, pass } = watched();
  tell("started");
  tell("started");
  pass(100);
  tell("ended");
  expect(watch.heldMs()).toBe(100);
  pass(100);
  tell("ended");
  expect(watch.heldMs()).toBe(200);
});

it("is lent nothing by someone else's wait on the same Flow", () => {
  const { watch } = watched();
  const end = automationStudioPersonWaitClock.begin({ projectId: "project-ports", flowId: "flow-ports" });
  expect(watch.heldMs()).toBe(0);
  end();
});

it("stops listening", () => {
  const { watch, listeners } = watched();
  expect(listeners.size).toBe(1);
  watch.stop();
  expect(listeners.size).toBe(0);
});
