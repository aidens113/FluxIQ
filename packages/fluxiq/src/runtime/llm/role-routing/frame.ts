// The role the work in hand plays where its task kind cannot say it: an Answer First attempt repairs a
// saved Flow that broke with the same decision calls it explores with, so only the attempt knows a
// round is a repair. It runs that round inside this frame, and every call in the round's async chain
// is routed as `repair` (`./request-role.ts`). One store per process, however many copies of Core it loads
// (the run overrides' pattern, `../../run-overrides/store.ts`); each frame lives in its own async
// context, so two attempts at once never see each other's.

import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationStudioLlmModelRole } from "./kind-roles.ts";

const STORE = Symbol.for("fluxiq.automation-studio.llm-model-role");

type Store = AsyncLocalStorage<AutomationStudioLlmModelRole>;

const holder = globalThis as typeof globalThis & { [STORE]?: Store };

const store: Store = holder[STORE] ??= new AsyncLocalStorage<AutomationStudioLlmModelRole>();

/** Runs `fn` with every model call in its async chain that a task kind would route to `explore` routed to `role` instead. */
export function runWithAutomationStudioLlmModelRole<T>(role: AutomationStudioLlmModelRole, fn: () => T): T {
  return store.run(role, fn);
}

/** The role the current async chain was given, or nothing outside every such frame. */
export function automationStudioLlmModelRoleFrame(): AutomationStudioLlmModelRole | undefined {
  return store.getStore();
}
