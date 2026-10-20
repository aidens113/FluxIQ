import { randomUUID } from "node:crypto";
import { automationStudioRunWait } from "../executor/pacing/index.ts";
import type { AutomationStudioRunEnvironment } from "./environment.ts";

/**
 * The live environment: exactly the fallbacks every caller uses today when it
 * is given nothing -- the wall clock, the run's own unreferenced, abortable
 * timer (`../executor/pacing/run-wait.ts`), `Math.random`, a random UUID, and
 * no channel scope -- so passing it changes nothing about a live run.
 */
export const automationStudioLiveRunEnvironment: AutomationStudioRunEnvironment = Object.freeze({
  kind: "live",
  now: () => Date.now(),
  delay: (ms: number, signal?: AbortSignal) => automationStudioRunWait(signal ? { signal } : {}, ms),
  random: () => Math.random(),
  newRunId: (prefix: string) => `${prefix}.${randomUUID()}`,
  within: <T>(work: () => Promise<T>): Promise<T> => work()
});
