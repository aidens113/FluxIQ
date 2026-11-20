// The ladder the work in hand climbs, for the provider that routes its calls (`../provider.ts`).
// Each evidence loop runs inside its attempt's ladder (`../../evidence-loop.ts`), so every call
// in a loop's async chain -- its decisions and the completion check it asks -- is served on the
// rung the attempt stands on at the moment it is made. A call outside every loop (an
// interpretation, a check before the first round) is served on the base rung. One store per
// process, however many copies of Core it loads (the run overrides' pattern,
// `../../../run-overrides/store.ts`); each frame lives in its own async context, so two attempts
// at once never see each other's.

import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationStudioLlmModelLadder } from "./state.ts";

const STORE = Symbol.for("fluxiq.automation-studio.llm-model-ladder");

type Store = AsyncLocalStorage<AutomationStudioLlmModelLadder>;

const holder = globalThis as typeof globalThis & { [STORE]?: Store };

const store: Store = holder[STORE] ??= new AsyncLocalStorage<AutomationStudioLlmModelLadder>();

/** Runs `fn` with every model call in its async chain served on `ladder`'s rung. */
export function runWithAutomationStudioLlmModelLadder<T>(ladder: AutomationStudioLlmModelLadder, fn: () => T): T {
  return store.run(ladder, fn);
}

/** The ladder the current async chain climbs, or nothing outside every such frame. */
export function automationStudioLlmModelLadderFrame(): AutomationStudioLlmModelLadder | undefined {
  return store.getStore();
}
