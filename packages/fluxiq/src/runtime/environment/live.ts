import { randomUUID } from "node:crypto";
import { automationStudioNativeDelay } from "./native-delay.ts";
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
  delay: automationStudioNativeDelay,
  random: () => Math.random(),
  newRunId: (prefix: string) => `${prefix}.${randomUUID()}`,
  within: <T>(work: () => Promise<T>): Promise<T> => work()
});
