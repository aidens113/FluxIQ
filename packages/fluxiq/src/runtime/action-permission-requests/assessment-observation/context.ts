import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationStudioActionAssessmentScope } from "./types.ts";

type Frame = Readonly<{
  scope: AutomationStudioActionAssessmentScope;
  parent: Frame | undefined;
}>;

// The host and a dynamically loaded domain can use separately bundled Core copies.
const STORE = Symbol.for("fluxiq.automation-studio.action-assessments.v1");
type Store = AsyncLocalStorage<Frame>;
const holder = globalThis as typeof globalThis & { [STORE]?: Store };
const frames: Store = holder[STORE] ??= new AsyncLocalStorage<Frame>();

/** Core-private transport; scopes never replace or hide an active ancestor. */
export function runWithAutomationStudioActionAssessments<T>(scope: AutomationStudioActionAssessmentScope, run: () => T): T {
  return frames.run(Object.freeze({ scope, parent: frames.getStore() }), run);
}

export function automationStudioActionAssessmentScopes(): readonly AutomationStudioActionAssessmentScope[] {
  const scopes: AutomationStudioActionAssessmentScope[] = [];
  for (let frame = frames.getStore(); frame; frame = frame.parent) scopes.push(frame.scope);
  return scopes;
}
