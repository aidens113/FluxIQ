import { AsyncLocalStorage } from "node:async_hooks";
import { automationStudioLlmStepLogDirectory } from "./directory.ts";

/** Which part of a build a step belongs to, as the build's phases set it. */
export type AutomationStudioLlmStepLogPhase = "explore" | "repair" | "test";

/** The round and phase every step made inside a scope is written with. */
export type AutomationStudioLlmStepLogContext = { round: number; phase: AutomationStudioLlmStepLogPhase };

const storage = new AsyncLocalStorage<AutomationStudioLlmStepLogContext>();

/**
 * The build's round and phase, carried to the provider adapters and the tool
 * wrapper without threading them through every call between.
 *
 * Core's provider call knows its task but not which round of a build it serves:
 * rounds and phases live in `flow-bootstrap/unfinished-build/phases.ts`, which
 * sets a scope around each round and each test. With the step log off, `run`
 * just calls `fn`.
 */
export const automationStudioLlmStepLogScope = {
  run<T>(context: AutomationStudioLlmStepLogContext, fn: () => T, env: Readonly<Record<string, string | undefined>> = process.env): T {
    if (!automationStudioLlmStepLogDirectory(env)) return fn();
    return storage.run({ round: context.round, phase: context.phase }, fn);
  },
  current(): AutomationStudioLlmStepLogContext | undefined {
    return storage.getStore();
  }
};
